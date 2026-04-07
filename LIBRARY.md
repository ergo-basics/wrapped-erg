# Wrapped ERG Library API

This package exports a reusable TypeScript API for integrating Wrapped ERG in other Ergo apps.

## Install

```bash
npm install wrapped-erg
```

## Quick start

```ts
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

// Discover existing banks
const banks = await listWrappedErgBanks();

// Connect to a specific bank
const manager = new WrappedErgManager(wallet, bankNftId, wergTokenId);
const state = await manager.getState();
console.log(state.ergReserve, state.wergReserve);
```

## Wallet context

The `wallet` parameter expects an object with:

```ts
{
  getUtxos(): Promise<Box[]>;
  getChangeAddress(): Promise<string>;
  signTx(tx: UnsignedTx): Promise<SignedTx>;
}
```

In a browser with Nautilus/SAFEW, you can use `window.ergo` directly or wrap it with `wallet-svelte-component`'s utilities.

## Convenience methods (sign + submit)

```ts
const wrapTxId = await manager.wrap(1_000_000_000n);          // 1 ERG -> WERG
const unwrapTxId = await manager.unwrap(500_000_000n);         // 0.5 WERG -> ERG
const bankTxId = await manager.createBank({ bankNft, wergTokenId, initialErgReserve, initialWergReserve });
```

## Builder methods (for chained transactions)

Return a `TransactionBuilder` you can customize before finalizing:

```ts
const builder = await manager.wrapBuilder({ amountNanoErg: 1_000_000_000n });

// Add extra outputs, change fee, etc.
const unsignedTx = builder
  .payFee(2_000_000n)
  .build()
  .toEIP12Object();
```

Available: `wrapBuilder()`, `unwrapBuilder()`, `createBankBuilder()`.

## Auto-mint bank creation

Create a new bank without pre-existing tokens (3 transactions):

```ts
const txId = await manager.createBankWithMint({
  nftName: 'My WERG Bank',
  wergName: 'WERG',
  wergSupply: 1_000_000n,
  initialErgReserve: 1_000_000_000n
});
```

## Static helpers

```ts
// Compile the bank contract for a given NFT + WERG pair
const ergoTree = WrappedErgManager.compileBankContract(bankNFT, wergTokenId);

// List all banks using default env config
const banks = await listWrappedErgBanks();
```

## Exported constants

```ts
import {
  BANK_NFT_ID,       // Default bank NFT (placeholder until deployed)
  WERG_TOKEN_ID,      // Default WERG token (placeholder until deployed)
  EXPLORER_API,       // Ergo Explorer API base URL
  NANOERG_PER_ERG,    // 1_000_000_000n
  MIN_BOX_VALUE,      // 1_000_000n
  DEFAULT_FEE         // 1_100_000n
} from 'wrapped-erg';
```

## Svelte stores

For SvelteKit apps, reactive stores are available:

```ts
import {
  address, connected, bankState, bankLoading, bankError,
  txPending, txError, txHistory,
  ergReserveDisplay, wergReserveDisplay,
  formatErg, parseErgToNano
} from 'wrapped-erg';
```
