import { TransactionBuilder, OutputBuilder, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { compile } from "@fleet-sdk/compiler";
import { BANK_NFT_ID, WERG_TOKEN_ID, EXPLORER_API } from "./envs";

// ============================================================
// Types
// ============================================================

export interface WergState {
    boxId: string;
    ergReserve: bigint;
    wergReserve: bigint;
    ergoTree: string;
}

export interface ExplorerBox {
    boxId: string;
    value: number;
    ergoTree: string;
    assets: Array<{
        tokenId: string;
        amount: number;
    }>;
    additionalRegisters: Record<string, string>;
    creationHeight: number;
    transactionId: string;
    index: number;
}

// ============================================================
// Explorer API helpers
// ============================================================

async function fetchCurrentHeight(): Promise<number> {
    const res = await fetch(`${EXPLORER_API}/blocks?limit=1&offset=0&sortBy=height&sortDirection=desc`);
    if (!res.ok) throw new Error('Failed to fetch current height');
    const data = await res.json();
    return data.items[0].height;
}

async function fetchUnspentBoxesByTokenId(tokenId: string): Promise<ExplorerBox[]> {
    const res = await fetch(`${EXPLORER_API}/boxes/unspent/byTokenId/${tokenId}?limit=10&offset=0`);
    if (!res.ok) throw new Error(`Failed to fetch boxes for token ${tokenId}`);
    const data = await res.json();
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

// ============================================================
// Compile the bank contract
// ============================================================

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

// ============================================================
// WrappedErgManager
// ============================================================

export class WrappedErgManager {
    private readonly bankNFT: string;
    private readonly wergTokenId: string;
    private readonly bankTree: string;
    private readonly wallet: any; // Nautilus dApp Connector

    constructor(wallet: any, bankNFT?: string, wergTokenId?: string) {
        this.bankNFT = bankNFT ?? BANK_NFT_ID;
        this.wergTokenId = wergTokenId ?? WERG_TOKEN_ID;
        this.wallet = wallet;
        this.bankTree = compileBankContract(this.bankNFT, this.wergTokenId);
    }

    /**
     * Fetch the current Bank Box from the blockchain.
     * The bank box is a singleton identified by the BankNFT.
     */
    async fetchBankBox(): Promise<ExplorerBox> {
        const unspentBoxes = await fetchUnspentBoxesByTokenId(this.bankNFT);
        if (unspentBoxes.length === 0) {
            throw new Error('Bank box not found on the network. It may not be deployed yet.');
        }
        return unspentBoxes[0];
    }

    /**
     * Get the current state of the WERG bank.
     */
    async getState(): Promise<WergState> {
        const bankBox = await this.fetchBankBox();
        const wergToken = bankBox.assets.find((t) => t.tokenId === this.wergTokenId);
        if (!wergToken) {
            throw new Error('WERG token not found in bank box');
        }

        return {
            boxId: bankBox.boxId,
            ergReserve: BigInt(bankBox.value),
            wergReserve: BigInt(wergToken.amount),
            ergoTree: bankBox.ergoTree
        };
    }

    /**
     * Wrap ERG → WERG
     * User sends ERG to the bank box and receives WERG tokens in return.
     * 
     * @param amountNanoErg Amount of nanoERG to wrap
     * @returns Transaction ID
     */
    async wrap(amountNanoErg: bigint): Promise<string> {
        const bankBox = await this.fetchBankBox();
        const userUtxos = await this.wallet.getUtxos();
        const changeAddress = await this.wallet.getChangeAddress();
        const currentHeight = await fetchCurrentHeight();

        const currentWergAmount = BigInt(
            bankBox.assets.find((t: any) => t.tokenId === this.wergTokenId)!.amount
        );
        const currentErgAmount = BigInt(bankBox.value);

        if (currentWergAmount < amountNanoErg) {
            throw new Error(
                `Insufficient WERG in bank. Available: ${currentWergAmount}, Requested: ${amountNanoErg}`
            );
        }

        // Build the new bank box output:
        // ERG increases by amountNanoErg, WERG decreases by amountNanoErg
        const newBankBox = new OutputBuilder(
            currentErgAmount + amountNanoErg,
            this.bankTree
        )
            .addTokens({ tokenId: this.bankNFT, amount: 1n })
            .addTokens({ tokenId: this.wergTokenId, amount: currentWergAmount - amountNanoErg });

        const unsignedTx = new TransactionBuilder(currentHeight)
            .from([bankBox, ...userUtxos])
            .to(newBankBox)
            .sendChangeTo(changeAddress)
            .payMinFee()
            .build()
            .toEIP12Object();

        const signedTx = await this.wallet.signTx(unsignedTx);
        const txId = await submitTx(signedTx);
        return txId;
    }

    /**
     * Unwrap WERG → ERG
     * User sends WERG tokens to the bank box and receives ERG in return.
     * 
     * @param amountWerg Amount of WERG to unwrap (in smallest unit, same scale as nanoERG)
     * @returns Transaction ID
     */
    async unwrap(amountWerg: bigint): Promise<string> {
        const bankBox = await this.fetchBankBox();
        const userUtxos = await this.wallet.getUtxos();
        const changeAddress = await this.wallet.getChangeAddress();
        const currentHeight = await fetchCurrentHeight();

        const currentWergAmount = BigInt(
            bankBox.assets.find((t: any) => t.tokenId === this.wergTokenId)!.amount
        );
        const currentErgAmount = BigInt(bankBox.value);

        // Bank needs enough ERG to release (must keep minimum box value)
        const minBankErg = SAFE_MIN_BOX_VALUE;
        if (currentErgAmount - amountWerg < minBankErg) {
            throw new Error(
                `Insufficient ERG in bank. Available: ${currentErgAmount - minBankErg}, Requested: ${amountWerg}`
            );
        }

        // Build the new bank box output:
        // ERG decreases by amountWerg, WERG increases by amountWerg
        const newBankBox = new OutputBuilder(
            currentErgAmount - amountWerg,
            this.bankTree
        )
            .addTokens({ tokenId: this.bankNFT, amount: 1n })
            .addTokens({ tokenId: this.wergTokenId, amount: currentWergAmount + amountWerg });

        const unsignedTx = new TransactionBuilder(currentHeight)
            .from([bankBox, ...userUtxos])
            .to(newBankBox)
            .sendChangeTo(changeAddress)
            .payMinFee()
            .build()
            .toEIP12Object();

        const signedTx = await this.wallet.signTx(unsignedTx);
        const txId = await submitTx(signedTx);
        return txId;
    }
}
