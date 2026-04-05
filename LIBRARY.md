# Wrapped ERG Library API

This package exports a reusable TypeScript API for integrating Wrapped ERG in other apps.

## Main exports

```ts
import {
  WrappedErgManager,
  listWrappedErgBanks,
  wrapped_erg_bank_contract
} from 'wrapped-erg';
```

## Capabilities

- compile the bank contract
- list current banks
- fetch a bank state
- build wrap tx objects
- build unwrap tx objects
- build create-bank tx objects
- optionally sign+submit through the manager convenience methods

## Builder-first flow

For chained transactions, use the `build*Tx` methods.

```ts
const manager = new WrappedErgManager(wallet, bankNftId, wergTokenId);

const unsignedWrap = await manager.buildWrapTx({
  amountNanoErg: 1_000_000_000n
});

// pass unsignedWrap into your app's broader tx flow
```

## List banks

```ts
const banks = await listWrappedErgBanks();
```

## Create a bank

```ts
const unsignedCreate = await manager.buildCreateBankTx({
  bankNft: '...',
  wergTokenId: '...',
  initialErgReserve: 10_000_000n,
  initialWergReserve: 1_000_000_000n
});
```

## Convenience submitters

If you just want the manager to sign and submit:

```ts
await manager.createBank(...)
await manager.wrap(1_000_000_000n)
await manager.unwrap(1_000_000_000n)
```
