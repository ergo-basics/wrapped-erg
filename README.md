# Wrapped ERG

1:1 ERG-to-WERG exchange on the Ergo blockchain. This repo is both a web app and a reusable TypeScript library.

Based on [ergo-basics/template](https://github.com/ergo-basics/template).

## What It Does

A bank box on Ergo holds native ERG plus exactly one wrapper token. The box stores the allowed `wergTokenId` in `R4[Coll[Byte]]`, and the contract enforces:

```text
ERG_in + WERG_in == ERG_out + WERG_out
```

Deposit ERG, receive the same amount of WERG. Return WERG, get your ERG back. Each bank is identified by its wrapper token ID, not by a separate NFT.

## Web App

The SvelteKit app provides:

- Bank discovery by scanning unspent boxes of the shared bank contract
- Wrap / Unwrap flows against the selected wrapper token
- Create Bank with a single mint+deploy transaction
- Wallet integration via [wallet-svelte-component](https://github.com/ergo-basics/wallet-svelte-component)

### Run locally

```bash
npm install
npm run dev
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

## Library Usage

Install from npm:

```bash
npm install ergo-basics/wrapped-erg
```

### Quick start

```ts
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

const banks = await listWrappedErgBanks();
const manager = new WrappedErgManager(wallet, banks[0]?.wergTokenId);

const txId = await manager.wrap(1_000_000_000n);
```

### Builder pattern

The `*Builder` methods return a `TransactionBuilder` so you can customize before signing:

```ts
const builder = await manager.wrapBuilder({ amountNanoErg: 1_000_000_000n });
const unsignedTx = builder
  .payFee(2_000_000n)
  .build()
  .toEIP12Object();

const signed = await wallet.signTx(unsignedTx);
```

Available builders: `wrapBuilder()`, `unwrapBuilder()`, `createBankBuilder()`.

### Auto-mint bank creation

Create a brand new bank without pre-existing tokens:

```ts
const txId = await manager.createBankWithMint({
  wergName: 'WERG',
  initialErgReserve: 1_000_000_000n
});
```

This executes a single transaction: mint wrapper token + create bank box.

### Convenience methods

```ts
await manager.wrap(1_000_000_000n);
await manager.unwrap(500_000_000n);
await manager.createBank({ wergTokenId, initialErgReserve, initialWergReserve });
```

### Exports

```ts
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

import type {
  WergState,
  ExplorerBox,
  WrappedErgBankSummary,
  CreateBankParams,
  CreateBankWithMintParams,
  WrapParams,
  UnwrapParams,
  UnsignedTxLike,
  WrappedErgTxBuilder
} from 'wrapped-erg';

import { wrapped_erg_bank_contract } from 'wrapped-erg';

import {
  EXPLORER_API,
  NANOERG_PER_ERG,
  MIN_BOX_VALUE,
  DEFAULT_FEE
} from 'wrapped-erg';
```

## Smart Contract

The contract is generic. Every valid bank box must:

- keep the same ErgoTree in `OUTPUTS(0)`
- keep exactly one token in `SELF` and `OUTPUTS(0)`
- store that token ID in `R4[Coll[Byte]]`
- ensure the token ID in the asset list matches `R4`
- preserve `ERG + WERG`

```scala
{
    val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
    val exactTokens = SELF.tokens.size == 1 && OUTPUTS(0).tokens.size == 1

    val hasR4 = SELF.R4[Coll[Byte]].isDefined && OUTPUTS(0).R4[Coll[Byte]].isDefined
    val selfWergId = SELF.R4[Coll[Byte]].getOrElse(SELF.tokens(0)._1)
    val outWergId = OUTPUTS(0).R4[Coll[Byte]].getOrElse(OUTPUTS(0).tokens(0)._1)

    val validExchange = (OUTPUTS(0).value + OUTPUTS(0).tokens(0)._2) == (SELF.value + SELF.tokens(0)._2)

    sigmaProp(
      isBankOutput &&
      exactTokens &&
      hasR4 &&
      SELF.tokens(0)._1 == selfWergId &&
      OUTPUTS(0).tokens(0)._1 == outWergId &&
      selfWergId == outWergId &&
      validExchange
    )
}
```

## License

MIT
