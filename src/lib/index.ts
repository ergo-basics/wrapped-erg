// Wrapped ERG — Public Library Exports

// Contract source
export { default as wrapped_erg_bank_contract } from './contracts/wrapped_erg_bank.es';

// Core manager + helpers
export {
  WrappedErgManager,
  listWrappedErgBanks
} from './ergo/wrappedErg';

export type {
  WergState,
  ExplorerBox,
  ExplorerAsset,
  WrappedErgBankSummary,
  CreateBankParams,
  WrapParams,
  UnwrapParams,
  UnsignedTxLike,
  WrappedErgTxBuilder
} from './ergo/wrappedErg';

// Environment config
export {
  BANK_NFT_ID,
  WERG_TOKEN_ID,
  EXPLORER_API,
  EXPLORER_URI_TX,
  EXPLORER_URI_TOKEN,
  EXPLORER_URI_ADDR,
  NANOERG_PER_ERG,
  MIN_BOX_VALUE,
  DEFAULT_FEE
} from './ergo/envs';

// Stores
export {
  address,
  network,
  connected,
  balance,
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
} from './ergo/store';
export type { TxRecord } from './ergo/store';
