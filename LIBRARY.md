# Wrapped ERG Library API

This package exports a reusable TypeScript API for integrating Wrapped ERG in other Ergo apps.

## Install

```bash
npm install github:ergo-basics/wrapped-erg
```

## Quick start

```ts
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

const banks = await listWrappedErgBanks();
if (banks.length === 0) {
  throw new Error('No banks discovered on-chain yet.');
}

const manager = new WrappedErgManager(wallet, banks[0]?.wergTokenId);
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

## Contract model

- Every bank box uses the same compiled ErgoTree
- The bank keeps exactly one token asset plus native ERG
- `R4[Coll[Byte]]` stores the allowed `wergTokenId`
- Discovery scans unspent boxes by that shared ErgoTree

## Convenience methods

```ts
const wrapTxId = await manager.wrap(1_000_000_000n);
const unwrapTxId = await manager.unwrap(500_000_000n);
const bankTxId = await manager.createBank({ wergTokenId, initialErgReserve, initialWergReserve });
```

## Builder methods

```ts
const builder = await manager.wrapBuilder({ amountNanoErg: 1_000_000_000n });

const unsignedTx = builder
  .payFee(2_000_000n)
  .build()
  .toEIP12Object();
```

Available: `wrapBuilder()`, `unwrapBuilder()`, `createBankBuilder()`.

## Auto-mint bank creation

```ts
const txId = await manager.createBankWithMint({
  wergName: 'WERG',
  initialErgReserve: 1_000_000_000n
});
```

This builds a single transaction that mints the wrapper token and creates the bank box with `R4` set to that token ID.

## Static helpers

```ts
const ergoTree = WrappedErgManager.compileBankContract();
const banks = await listWrappedErgBanks();
```

## Exported constants

```ts
import {
  EXPLORER_API,
  NANOERG_PER_ERG,
  MIN_BOX_VALUE,
  DEFAULT_FEE
} from 'wrapped-erg';
```

## Svelte stores

```ts
import {
  address,
  connected,
  bankState,
  bankLoading,
  bankError,
  txPending,
  txError,
  txHistory,
  ergReserveDisplay,
  wergReserveDisplay,
  formatErg,
  parseErgToNano
} from 'wrapped-erg';
```
