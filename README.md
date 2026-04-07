# Wrapped ERG

1:1 ERG-to-WERG exchange on the Ergo blockchain. This repo is both a **web app** and a **reusable TypeScript library**.

Based on [ergo-basics/template](https://github.com/ergo-basics/template).

## What it does

A "bank box" on Ergo holds ERG and WERG tokens behind a smart contract that enforces a simple invariant:

```
ERG_in + WERG_in == ERG_out + WERG_out
```

Deposit ERG, receive the same amount of WERG. Return WERG, get your ERG back. The bank NFT makes each bank a singleton — only one unspent box per bank exists at any time.

## Web App

The SvelteKit app provides:

- **Bank discovery** — lists all deployed WERG banks on-chain
- **Wrap / Unwrap** — exchange ERG for WERG and back
- **Create Bank** — auto-mints a Bank NFT + WERG token and deploys a new bank box (3-step transaction flow)
- **Wallet integration** — connects via [wallet-svelte-component](https://github.com/ergo-basics/wallet-svelte-component) (Nautilus, SAFEW)

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

Install from the repo or npm (once published):

```bash
npm install wrapped-erg
```

### Quick start

```ts
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

// List all banks on-chain
const banks = await listWrappedErgBanks();

// Create a manager with your wallet context
const manager = new WrappedErgManager(wallet, bankNftId, wergTokenId);

// One-liner wrap (sign + submit)
const txId = await manager.wrap(1_000_000_000n); // 1 ERG
```

### Builder pattern (for chained transactions)

The `*Builder` methods return a `TransactionBuilder` so you can customize before signing:

```ts
// Get a builder, add extra outputs, change fee, then finalize
const builder = await manager.wrapBuilder({ amountNanoErg: 1_000_000_000n });
const unsignedTx = builder
  .payFee(2_000_000n)
  .build()
  .toEIP12Object();

// Sign with your own flow
const signed = await wallet.signTx(unsignedTx);
```

Available builders: `wrapBuilder()`, `unwrapBuilder()`, `createBankBuilder()`.

### Auto-mint bank creation

Create a brand new bank without pre-existing tokens:

```ts
const txId = await manager.createBankWithMint({
  nftName: 'My WERG Bank',
  wergName: 'WERG',
  wergSupply: 1_000_000n,
  initialErgReserve: 1_000_000_000n // 1 ERG
});
```

This executes 3 transactions: mint NFT, mint WERG token, create bank box.

### Convenience methods

```ts
await manager.wrap(1_000_000_000n);
await manager.unwrap(500_000_000n);
await manager.createBank({ bankNft, wergTokenId, initialErgReserve, initialWergReserve });
```

### Exports

```ts
// Core
import { WrappedErgManager, listWrappedErgBanks } from 'wrapped-erg';

// Types
import type {
  WergState, ExplorerBox, WrappedErgBankSummary,
  CreateBankParams, CreateBankWithMintParams,
  WrapParams, UnwrapParams, UnsignedTxLike, WrappedErgTxBuilder
} from 'wrapped-erg';

// Contract source
import { wrapped_erg_bank_contract } from 'wrapped-erg';

// Config constants
import {
  BANK_NFT_ID, WERG_TOKEN_ID, EXPLORER_API,
  NANOERG_PER_ERG, MIN_BOX_VALUE, DEFAULT_FEE
} from 'wrapped-erg';

// Svelte stores (for SvelteKit apps)
import {
  address, connected, bankState, bankLoading,
  ergReserveDisplay, wergReserveDisplay, formatErg, parseErgToNano
} from 'wrapped-erg';
```

## Smart Contract

The ErgoScript bank contract:

```scala
{
    val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
    val exactTokens = OUTPUTS(0).tokens.size == 2
    val keepsNFT    = OUTPUTS(0).tokens(0)._1 == _BankNFT
    val keepsWergID = OUTPUTS(0).tokens(1)._1 == _WergID

    val ergIn  = SELF.value
    val wergIn = SELF.tokens(1)._2
    val ergOut  = OUTPUTS(0).value
    val wergOut = OUTPUTS(0).tokens(1)._2

    val validExchange = (ergOut + wergOut) == (ergIn + wergIn)

    sigmaProp(isBankOutput && exactTokens && keepsNFT && keepsWergID && validExchange)
}
```

`_BankNFT` and `_WergID` are injected at compile time via `@fleet-sdk/compiler`.

## License

MIT
