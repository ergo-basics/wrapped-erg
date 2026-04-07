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
  CreateBankWithMintParams,
  WrapParams,
  UnwrapParams,
  UnsignedTxLike,
  WrappedErgTxBuilder
} from './ergo/wrappedErg';

// Environment config
export {
  EXPLORER_API,
  EXPLORER_URI_TX,
  EXPLORER_URI_TOKEN,
  EXPLORER_URI_ADDR,
  NANOERG_PER_ERG,
  MIN_BOX_VALUE,
  DEFAULT_FEE,
  WERG_DECIMALS,
  ERG_MAX_SUPPLY,
  ERG_MAX_SUPPLY_NANO
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
