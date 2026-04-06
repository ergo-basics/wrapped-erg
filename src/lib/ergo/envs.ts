/**
 * Network configuration for Wrapped ERG
 * 
 * Token IDs are placeholders — replace with actual deployed token IDs.
 */

// ============================================================
// TOKEN IDS — Replace these after deploying the bank box
// ============================================================

/** NFT ID that uniquely identifies the official Bank Box (singleton) */
export const BANK_NFT_ID = '0000000000000000000000000000000000000000000000000000000000000001';

/** Token ID of the WERG token */
export const WERG_TOKEN_ID = '0000000000000000000000000000000000000000000000000000000000000002';

// ============================================================
// NETWORK CONFIG
// ============================================================

export const MAINNET_EXPLORER_API = 'https://api.ergoplatform.com/api/v1';
export const TESTNET_EXPLORER_API = 'https://api-testnet.ergoplatform.com/api/v1';

export const MAINNET_EXPLORER_URI_TX = 'https://sigmaspace.io/en/transaction/';
export const MAINNET_EXPLORER_URI_TOKEN = 'https://sigmaspace.io/en/token/';
export const MAINNET_EXPLORER_URI_ADDR = 'https://sigmaspace.io/en/address/';

export const TESTNET_EXPLORER_URI_TX = 'https://testnet.ergoplatform.com/en/transactions/';
export const TESTNET_EXPLORER_URI_TOKEN = 'https://testnet.ergoplatform.com/en/token/';
export const TESTNET_EXPLORER_URI_ADDR = 'https://testnet.ergoplatform.com/en/addresses/';

// Default to mainnet
export const EXPLORER_API = MAINNET_EXPLORER_API;
export const EXPLORER_URI_TX = MAINNET_EXPLORER_URI_TX;
export const EXPLORER_URI_TOKEN = MAINNET_EXPLORER_URI_TOKEN;
export const EXPLORER_URI_ADDR = MAINNET_EXPLORER_URI_ADDR;

// ============================================================
// CONSTANTS
// ============================================================

/** 1 ERG = 1_000_000_000 nanoERG */
export const NANOERG_PER_ERG = 1_000_000_000n;

/** Minimum box value in nanoERG */
export const MIN_BOX_VALUE = 1_000_000n;

/** Default miner fee in nanoERG (0.001 ERG) */
export const DEFAULT_FEE = 1_100_000n;
