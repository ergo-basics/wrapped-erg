import { TransactionBuilder, OutputBuilder, SAFE_MIN_BOX_VALUE } from '@fleet-sdk/core';
import { compile } from '@fleet-sdk/compiler';
import {
  BANK_NFT_ID,
  WERG_TOKEN_ID,
  EXPLORER_API,
  DEFAULT_FEE,
  MIN_BOX_VALUE,
  WERG_DECIMALS
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
  bankNft: string;
  wergTokenId: string;
}

export interface CreateBankParams {
  bankNft: string;
  wergTokenId: string;
  initialErgReserve: bigint;
  initialWergReserve: bigint;
}

export interface CreateBankWithMintParams {
  nftName: string;
  wergName: string;
  /** Initial ERG to lock in the bank (in nanoERG). WERG supply is always equal to this (1:1 peg). */
  initialErgReserve: bigint;
}

export interface WrapParams {
  amountNanoErg: bigint;
  bankNft?: string;
  wergTokenId?: string;
}

export interface UnwrapParams {
  amountWerg: bigint;
  bankNft?: string;
  wergTokenId?: string;
}

export type UnsignedTxLike = ReturnType<ReturnType<TransactionBuilder['build']>['toEIP12Object']>;

/**
 * A partially-configured TransactionBuilder ready for `.build().toEIP12Object()`.
 * Callers can add extra outputs, change fees, etc. before finalizing.
 */
export type WrappedErgTxBuilder = TransactionBuilder;

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
  const data = await fetchJson(`${EXPLORER_API}/boxes/unspent/byTokenId/${tokenId}?limit=50&offset=0`);
  return data.items || [];
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

function compileBankContract(bankNFT: string, wergTokenId: string): string {
  const script = `
  {
      val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
      val exactTokens = OUTPUTS(0).tokens.size == 2
      val keepsNFT    = OUTPUTS(0).tokens(0)._1 == fromBase16("${bankNFT}")
      val keepsWergID = OUTPUTS(0).tokens(1)._1 == fromBase16("${wergTokenId}")

      val ergIn  = SELF.value
      val wergIn = SELF.tokens(1)._2
      val ergOut  = OUTPUTS(0).value
      val wergOut = OUTPUTS(0).tokens(1)._2

      val validExchange = (ergOut + wergOut) == (ergIn + wergIn)

      sigmaProp(isBankOutput && exactTokens && keepsNFT && keepsWergID && validExchange)
  }
  `;
  return compile(script).toHex();
}

function buildBankOutput(bankTree: string, bankNFT: string, wergTokenId: string, ergAmount: bigint, wergAmount: bigint) {
  return new OutputBuilder(ergAmount, bankTree)
    .addTokens({ tokenId: bankNFT, amount: 1n })
    .addTokens({ tokenId: wergTokenId, amount: wergAmount });
}

export class WrappedErgManager {
  private readonly wallet: any;
  readonly bankNFT: string;
  readonly wergTokenId: string;
  readonly bankTree: string;

  constructor(wallet: any, bankNFT?: string, wergTokenId?: string) {
    this.wallet = wallet;
    this.bankNFT = bankNFT ?? BANK_NFT_ID;
    this.wergTokenId = wergTokenId ?? WERG_TOKEN_ID;
    this.bankTree = compileBankContract(this.bankNFT, this.wergTokenId);
  }

  static compileBankContract(bankNFT: string, wergTokenId: string): string {
    return compileBankContract(bankNFT, wergTokenId);
  }

  static async listBanks(): Promise<WrappedErgBankSummary[]> {
    const boxes = await fetchUnspentBoxesByTokenId(BANK_NFT_ID);
    return boxes
      .filter((box) => box.assets.length >= 2)
      .map((box) => {
        const bankNft = box.assets[0]?.tokenId;
        const werg = box.assets[1];
        return {
          boxId: box.boxId,
          ergReserve: BigInt(box.value),
          wergReserve: BigInt(werg?.amount ?? 0),
          ergoTree: box.ergoTree,
          bankNft,
          wergTokenId: werg?.tokenId ?? ''
        };
      });
  }

  async fetchBankBox(bankNft = this.bankNFT): Promise<ExplorerBox> {
    const unspentBoxes = await fetchUnspentBoxesByTokenId(bankNft);
    if (unspentBoxes.length === 0) {
      throw new Error('Bank box not found on the network. It may not be deployed yet.');
    }
    return unspentBoxes[0];
  }

  async getState(bankNft = this.bankNFT, wergTokenId = this.wergTokenId): Promise<WergState> {
    const bankBox = await this.fetchBankBox(bankNft);
    const wergToken = bankBox.assets.find((t) => t.tokenId === wergTokenId);
    if (!wergToken) throw new Error('WERG token not found in bank box');
    return {
      boxId: bankBox.boxId,
      ergReserve: BigInt(bankBox.value),
      wergReserve: BigInt(wergToken.amount),
      ergoTree: bankBox.ergoTree
    };
  }

  // ---------------------------------------------------------------
  // Auto-mint bank creation (two-step: mint NFT, then mint WERG + create bank)
  // ---------------------------------------------------------------

  async createBankWithMint(params: CreateBankWithMintParams): Promise<string> {
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();

    // WERG supply always equals initial ERG reserve (1:1 peg, both use 9 decimals)
    const wergSupply = params.initialErgReserve;

    // STEP 1: Mint the Bank NFT (amount: 1)
    // Token ID will be the first input's box ID
    const nftMintOutput = new OutputBuilder(MIN_BOX_VALUE, changeAddress)
      .mintToken({
        amount: 1n,
        name: params.nftName
      });

    const mintNftTx = new TransactionBuilder(currentHeight)
      .from(userUtxos)
      .to(nftMintOutput)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE)
      .build()
      .toEIP12Object();

    const signedNftTx = await this.wallet.signTx(mintNftTx);
    const nftTxId = await submitTx(signedNftTx);

    // The minted NFT token ID = first input's box ID
    const bankNftId = mintNftTx.inputs[0].boxId;

    // Wait a moment for the TX to propagate, then fetch the new UTxOs
    await new Promise(r => setTimeout(r, 2000));

    // STEP 2: Mint WERG tokens and create the bank box
    const freshUtxos = await this.wallet.getUtxos();
    const freshHeight = await fetchCurrentHeight();

    // Find the box containing the freshly minted NFT
    const nftBox = freshUtxos.find((u: any) =>
      u.assets?.some((a: any) => a.tokenId === bankNftId)
    );
    const otherUtxos = freshUtxos.filter((u: any) => u !== nftBox);
    const allInputs = nftBox ? [nftBox, ...otherUtxos] : freshUtxos;

    // Mint WERG token — its ID will be the first input's box ID of this TX
    // 9 decimals to match ERG (1 WERG = 1_000_000_000 smallest units = 1 ERG)
    const wergMintOutput = new OutputBuilder(MIN_BOX_VALUE, changeAddress)
      .mintToken({
        amount: wergSupply,
        name: params.wergName,
        decimals: WERG_DECIMALS
      });

    const mintWergTx = new TransactionBuilder(freshHeight)
      .from(allInputs)
      .to(wergMintOutput)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE)
      .build()
      .toEIP12Object();

    const signedWergTx = await this.wallet.signTx(mintWergTx);
    const wergTxId = await submitTx(signedWergTx);
    const wergTokenId = mintWergTx.inputs[0].boxId;

    // Wait for WERG mint TX to propagate
    await new Promise(r => setTimeout(r, 2000));

    // STEP 3: Create the bank box with both tokens
    const bankUtxos = await this.wallet.getUtxos();
    const bankHeight = await fetchCurrentHeight();
    const bankTree = compileBankContract(bankNftId, wergTokenId);
    const outputValue = params.initialErgReserve < MIN_BOX_VALUE ? MIN_BOX_VALUE : params.initialErgReserve;

    const bankOutput = buildBankOutput(bankTree, bankNftId, wergTokenId, outputValue, wergSupply);

    const createBankTx = new TransactionBuilder(bankHeight)
      .from(bankUtxos)
      .to(bankOutput)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE)
      .build()
      .toEIP12Object();

    const signedBankTx = await this.wallet.signTx(createBankTx);
    return submitTx(signedBankTx);
  }

  // ---------------------------------------------------------------
  // Builder methods — return TransactionBuilder for chaining
  // Callers can .to(extraOutput).payFee(customFee).build().toEIP12Object()
  // ---------------------------------------------------------------

  async createBankBuilder(params: CreateBankParams): Promise<WrappedErgTxBuilder> {
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();
    const bankTree = compileBankContract(params.bankNft, params.wergTokenId);
    const outputValue = params.initialErgReserve < MIN_BOX_VALUE ? MIN_BOX_VALUE : params.initialErgReserve;

    const bankOutput = buildBankOutput(
      bankTree,
      params.bankNft,
      params.wergTokenId,
      outputValue,
      params.initialWergReserve
    );

    return new TransactionBuilder(currentHeight)
      .from(userUtxos)
      .to(bankOutput)
      .sendChangeTo(changeAddress)
      .payFee(DEFAULT_FEE);
  }

  async wrapBuilder(params: WrapParams): Promise<WrappedErgTxBuilder> {
    const bankNft = params.bankNft ?? this.bankNFT;
    const wergTokenId = params.wergTokenId ?? this.wergTokenId;
    const bankTree = compileBankContract(bankNft, wergTokenId);
    const bankBox = await this.fetchBankBox(bankNft);
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();

    const currentWergAmount = BigInt(bankBox.assets.find((t: any) => t.tokenId === wergTokenId)?.amount ?? 0);
    const currentErgAmount = BigInt(bankBox.value);

    if (currentWergAmount < params.amountNanoErg) {
      throw new Error(`Insufficient WERG in bank. Available: ${currentWergAmount}, Requested: ${params.amountNanoErg}`);
    }

    const newBankBox = buildBankOutput(
      bankTree,
      bankNft,
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
    const bankNft = params.bankNft ?? this.bankNFT;
    const wergTokenId = params.wergTokenId ?? this.wergTokenId;
    const bankTree = compileBankContract(bankNft, wergTokenId);
    const bankBox = await this.fetchBankBox(bankNft);
    const userUtxos = await this.wallet.getUtxos();
    const changeAddress = await this.wallet.getChangeAddress();
    const currentHeight = await fetchCurrentHeight();

    const currentWergAmount = BigInt(bankBox.assets.find((t: any) => t.tokenId === wergTokenId)?.amount ?? 0);
    const currentErgAmount = BigInt(bankBox.value);

    if (currentErgAmount - params.amountWerg < SAFE_MIN_BOX_VALUE) {
      throw new Error(`Insufficient ERG in bank. Available: ${currentErgAmount - SAFE_MIN_BOX_VALUE}, Requested: ${params.amountWerg}`);
    }

    const newBankBox = buildBankOutput(
      bankTree,
      bankNft,
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

  // ---------------------------------------------------------------
  // Convenience methods — build + sign + submit in one call
  // ---------------------------------------------------------------

  async buildCreateBankTx(params: CreateBankParams): Promise<UnsignedTxLike> {
    return (await this.createBankBuilder(params)).build().toEIP12Object();
  }

  async createBank(params: CreateBankParams): Promise<string> {
    const unsignedTx = await this.buildCreateBankTx(params);
    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }

  async buildWrapTx(params: WrapParams): Promise<UnsignedTxLike> {
    return (await this.wrapBuilder(params)).build().toEIP12Object();
  }

  async wrap(amountNanoErg: bigint): Promise<string> {
    const unsignedTx = await this.buildWrapTx({ amountNanoErg });
    const signedTx = await this.wallet.signTx(unsignedTx);
    return submitTx(signedTx);
  }

  async buildUnwrapTx(params: UnwrapParams): Promise<UnsignedTxLike> {
    return (await this.unwrapBuilder(params)).build().toEIP12Object();
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
