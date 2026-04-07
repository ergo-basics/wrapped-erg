import { TransactionBuilder, OutputBuilder, SAFE_MIN_BOX_VALUE } from '@fleet-sdk/core';
import { compile } from '@fleet-sdk/compiler';
import wrappedErgBankContract from '../contracts/wrapped_erg_bank.es';
import {
  EXPLORER_API,
  DEFAULT_FEE,
  MIN_BOX_VALUE,
  WERG_DECIMALS,
  ERG_MAX_SUPPLY_NANO
} from './envs';

export interface WergState {
  boxId: string;
  ergReserve: bigint;
  wergReserve: bigint;
  ergoTree: string;
}

export interface ExplorerAsset {
  tokenId: string;
  amount: number;
  name?: string;
  decimals?: number;
}

export interface ExplorerBox {
  boxId: string;
  value: number;
  ergoTree: string;
  assets: ExplorerAsset[];
  additionalRegisters: Record<string, string>;
  creationHeight: number;
  transactionId: string;
  index: number;
  address?: string;
}

export interface WrappedErgBankSummary extends WergState {
  wergTokenId: string;
}

export interface CreateBankParams {
  wergTokenId: string;
  initialErgReserve: bigint;
  initialWergReserve: bigint;
}

export interface CreateBankWithMintParams {
  wergName: string;
  /** Initial ERG to lock in the bank (in nanoERG). */
  initialErgReserve: bigint;
}

export interface WrapParams {
  amountNanoErg: bigint;
  wergTokenId?: string;
}

export interface UnwrapParams {
  amountWerg: bigint;
  wergTokenId?: string;
}

export type UnsignedTxLike = ReturnType<ReturnType<TransactionBuilder['build']>['toEIP12Object']>;

/**
 * A partially-configured TransactionBuilder ready for `.build().toEIP12Object()`.
 * Callers can add extra outputs, change fees, etc. before finalizing.
 */
export type WrappedErgTxBuilder = TransactionBuilder;

const BANK_CONTRACT_TREE = compile(wrappedErgBankContract).toHex();

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

async function fetchCurrentHeight(): Promise<number> {
  const data = await fetchJson(`${EXPLORER_API}/blocks?limit=1&offset=0&sortBy=height&sortDirection=desc`);
  return data.items[0].height;
}

async function fetchUnspentBoxesByTokenId(tokenId: string): Promise<ExplorerBox[]> {
  const data = await fetchJson(`${EXPLORER_API}/boxes/unspent/byTokenId/${encodeURIComponent(tokenId)}?limit=50&offset=0`);
  return data.items || [];
}

async function fetchUnspentBoxesByErgoTree(ergoTree: string): Promise<ExplorerBox[]> {
  const limit = 50;
  let offset = 0;
  const items: ExplorerBox[] = [];

  while (true) {
    const data = await fetchJson(
      `${EXPLORER_API}/boxes/unspent/byErgoTree/${encodeURIComponent(ergoTree)}?limit=${limit}&offset=${offset}`
    );
    const page = data.items || [];
    items.push(...page);
    if (page.length < limit) return items;
    offset += limit;
  }
}

async function submitTx(signedTx: any): Promise<string> {
  const res = await fetch(`${EXPLORER_API}/mempool/transactions/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedTx)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to submit transaction: ${errText}`);
  }
  const data = await res.json();
  return data.id;
}

function serializeCollByte(hexValue: string): string {
  const normalized = hexValue.toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex value for Coll[Byte] register: ${hexValue}`);
  }

  const byteLength = normalized.length / 2;
  if (byteLength > 127) {
    throw new Error('Coll[Byte] register serialization currently supports values up to 127 bytes.');
  }

  return `0e${byteLength.toString(16).padStart(2, '0')}${normalized}`;
}

function deserializeCollByte(registerValue?: string): string | null {
  if (!registerValue || registerValue.length < 4) return null;
  const normalized = registerValue.toLowerCase();
  if (!normalized.startsWith('0e')) return null;

  const byteLength = parseInt(normalized.slice(2, 4), 16);
  const value = normalized.slice(4);
  if (value.length !== byteLength * 2) return null;

  return value;
}

function getBankTokenIdFromBox(box: ExplorerBox): string | null {
  if (box.ergoTree !== BANK_CONTRACT_TREE) return null;
  if (box.assets.length !== 1) return null;

  const assetTokenId = box.assets[0]?.tokenId?.toLowerCase();
  const registerTokenId = deserializeCollByte(box.additionalRegisters?.R4);
  if (!assetTokenId || !registerTokenId) return null;
  if (assetTokenId !== registerTokenId) return null;

  return assetTokenId;
}

function isBankBox(box: ExplorerBox, expectedTokenId?: string): boolean {
  const tokenId = getBankTokenIdFromBox(box);
  if (!tokenId) return false;
  return !expectedTokenId || tokenId === expectedTokenId.toLowerCase();
}

function requireBankAsset(box: ExplorerBox): ExplorerAsset {
  if (!isBankBox(box)) {
    throw new Error(`Invalid bank box shape for ${box.boxId}`);
  }

  return box.assets[0];
}

function getCurrentWergAmount(box: ExplorerBox, wergTokenId: string): bigint {
  const asset = requireBankAsset(box);
  if (asset.tokenId.toLowerCase() !== wergTokenId.toLowerCase()) {
    throw new Error('Requested wrapper token does not match the bank box register.');
  }

  return BigInt(asset.amount);
}

function buildBankOutput(bankTree: string, wergTokenId: string, ergAmount: bigint, wergAmount: bigint) {
  return new OutputBuilder(ergAmount, bankTree)
    .addTokens({ tokenId: wergTokenId, amount: wergAmount })
    .setAdditionalRegisters({ R4: serializeCollByte(wergTokenId) });
}

function minBoxValueOrReserve(initialErgReserve: bigint): bigint {
  return initialErgReserve < MIN_BOX_VALUE ? MIN_BOX_VALUE : initialErgReserve;
}

function buildUnsignedTx(builder: TransactionBuilder): UnsignedTxLike {
  return builder.build().toEIP12Object();
}

function orderedMintInputs(utxos: any[]): [any, ...any[]] {
  if (utxos.length === 0) {
    throw new Error('Wallet returned no UTxOs.');
  }

  return utxos as [any, ...any[]];
}

export class WrappedErgManager {
  private readonly wallet: any;
  readonly wergTokenId?: string;
  readonly bankTree: string;

  constructor(wallet: any, wergTokenId?: string) {
    this.wallet = wallet;
    this.wergTokenId = wergTokenId;
    this.bankTree = BANK_CONTRACT_TREE;
  }

  private resolveWergTokenId(wergTokenId?: string): string {
    const resolved = wergTokenId ?? this.wergTokenId;
    if (!resolved) {
      throw new Error('A wrapper token ID is required for this operation. Select a bank or pass wergTokenId explicitly.');
    }

    return resolved;
  }

  static compileBankContract(): string {
    return BANK_CONTRACT_TREE;
  }

  static async listBanks(): Promise<WrappedErgBankSummary[]> {
    const boxes = await fetchUnspentBoxesByErgoTree(BANK_CONTRACT_TREE);
    return boxes
      .filter((box) => isBankBox(box))
      .map((box) => {
        const wergTokenId = getBankTokenIdFromBox(box) ?? '';
        const werg = requireBankAsset(box);

        return {
          boxId: box.boxId,
          ergReserve: BigInt(box.value),
          wergReserve: BigInt(werg.amount),
          ergoTree: box.ergoTree,
          wergTokenId
        };
      });
  }

  async fetchBankBox(wergTokenId?: string): Promise<ExplorerBox> {
    const resolvedTokenId = this.resolveWergTokenId(wergTokenId);
    const unspentBoxes = await fetchUnspentBoxesByTokenId(resolvedTokenId);
    const bankBox = unspentBoxes.find((box) => isBankBox(box, resolvedTokenId));

    if (!bankBox) {
      throw new Error('Bank box not found on the network. It may not be deployed yet.');
    }

    return bankBox;
  }

  async getState(wergTokenId = this.wergTokenId): Promise<WergState> {
    const resolvedTokenId = this.resolveWergTokenId(wergTokenId);
    const bankBox = await this.fetchBankBox(resolvedTokenId);
    return {
      boxId: bankBox.boxId,
      ergReserve: BigInt(bankBox.value),
      wergReserve: getCurrentWergAmount(bankBox, resolvedTokenId),
      ergoTree: bankBox.ergoTree
    };
  }

  async createBankWithMint(params: CreateBankWithMintParams): Promise<string> {
    const userUtxos = orderedMintInputs(await this.wallet.getUtxos());
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();
    const predictedTokenId = userUtxos[0].boxId;
    const outputValue = minBoxValueOrReserve(params.initialErgReserve);

    const bankOutput = new OutputBuilder(outputValue, this.bankTree)
      .mintToken({
        amount: ERG_MAX_SUPPLY_NANO,
        name: params.wergName,
        decimals: WERG_DECIMALS
      })
      .setAdditionalRegisters({ R4: serializeCollByte(predictedTokenId) });

    const unsignedTx = buildUnsignedTx(
      new TransactionBuilder(currentHeight)
        .from(userUtxos)
        .to(bankOutput)
        .sendChangeTo(changeAddress)
        .payFee(DEFAULT_FEE)
    );

    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }

  async createBankBuilder(params: CreateBankParams): Promise<WrappedErgTxBuilder> {
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();
    const outputValue = minBoxValueOrReserve(params.initialErgReserve);

    return new TransactionBuilder(currentHeight)
      .from(userUtxos)
      .to(buildBankOutput(this.bankTree, params.wergTokenId, outputValue, params.initialWergReserve))
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE);
  }

  async wrapBuilder(params: WrapParams): Promise<WrappedErgTxBuilder> {
    const wergTokenId = this.resolveWergTokenId(params.wergTokenId);
    const bankBox = await this.fetchBankBox(wergTokenId);
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();

    const currentWergAmount = getCurrentWergAmount(bankBox, wergTokenId);
    const currentErgAmount = BigInt(bankBox.value);

    if (currentWergAmount < params.amountNanoErg) {
      throw new Error(`Insufficient WERG in bank. Available: ${currentWergAmount}, Requested: ${params.amountNanoErg}`);
    }

    const newBankBox = buildBankOutput(
      this.bankTree,
      wergTokenId,
      currentErgAmount + params.amountNanoErg,
      currentWergAmount - params.amountNanoErg
    );

    return new TransactionBuilder(currentHeight)
      .from([bankBox, ...userUtxos])
      .to(newBankBox)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE);
  }

  async unwrapBuilder(params: UnwrapParams): Promise<WrappedErgTxBuilder> {
    const wergTokenId = this.resolveWergTokenId(params.wergTokenId);
    const bankBox = await this.fetchBankBox(wergTokenId);
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();

    const currentWergAmount = getCurrentWergAmount(bankBox, wergTokenId);
    const currentErgAmount = BigInt(bankBox.value);

    if (currentErgAmount - params.amountWerg < SAFE_MIN_BOX_VALUE) {
      throw new Error(`Insufficient ERG in bank. Available: ${currentErgAmount - SAFE_MIN_BOX_VALUE}, Requested: ${params.amountWerg}`);
    }

    const newBankBox = buildBankOutput(
      this.bankTree,
      wergTokenId,
      currentErgAmount - params.amountWerg,
      currentWergAmount + params.amountWerg
    );

    return new TransactionBuilder(currentHeight)
      .from([bankBox, ...userUtxos])
      .to(newBankBox)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE);
  }

  async buildCreateBankTx(params: CreateBankParams): Promise<UnsignedTxLike> {
    return buildUnsignedTx(await this.createBankBuilder(params));
  }

  async createBank(params: CreateBankParams): Promise<string> {
    const unsignedTx = await this.buildCreateBankTx(params);
    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }

  async buildWrapTx(params: WrapParams): Promise<UnsignedTxLike> {
    return buildUnsignedTx(await this.wrapBuilder(params));
  }

  async wrap(amountNanoErg: bigint): Promise<string> {
    const unsignedTx = await this.buildWrapTx({ amountNanoErg });
    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }

  async buildUnwrapTx(params: UnwrapParams): Promise<UnsignedTxLike> {
    return buildUnsignedTx(await this.unwrapBuilder(params));
  }

  async unwrap(amountWerg: bigint): Promise<string> {
    const unsignedTx = await this.buildUnwrapTx({ amountWerg });
    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }
}

export async function listWrappedErgBanks() {
  return WrappedErgManager.listBanks();
}
