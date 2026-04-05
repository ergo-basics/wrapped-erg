import { writable, derived } from 'svelte/store';
import type { WergState } from './wrappedErg';
import {
    MAINNET_EXPLORER_URI_TX,
    MAINNET_EXPLORER_URI_TOKEN,
    MAINNET_EXPLORER_URI_ADDR,
    NANOERG_PER_ERG
} from './envs';

// ============================================================
// Wallet stores (from template pattern)
// ============================================================
export const address = writable<string | null>(null);
export const network = writable<string | null>(null);
export const connected = writable<boolean>(false);
export const balance = writable<number | null>(null);

// ============================================================
// Bank state stores
// ============================================================
export const bankState = writable<WergState | null>(null);
export const bankLoading = writable<boolean>(false);
export const bankError = writable<string | null>(null);

// ============================================================
// Transaction state
// ============================================================
export interface TxRecord {
    txId: string;
    type: 'wrap' | 'unwrap';
    amount: string; // human-readable ERG amount
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
}

export const txPending = writable<boolean>(false);
export const txError = writable<string | null>(null);
export const txHistory = writable<TxRecord[]>([]);

// Load tx history from localStorage
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

if (isBrowser) {
    try {
        const stored = localStorage.getItem('werg_tx_history');
        if (stored) {
            txHistory.set(JSON.parse(stored));
        }
    } catch {
        // ignore
    }
    txHistory.subscribe(value => {
        if (value !== undefined) {
            localStorage.setItem('werg_tx_history', JSON.stringify(value));
        }
    });
}

// ============================================================
// Derived stores
// ============================================================

/** ERG reserve as human-readable number */
export const ergReserveDisplay = derived(bankState, ($bankState) => {
    if (!$bankState) return '—';
    return formatErg($bankState.ergReserve);
});

/** WERG reserve as human-readable number */
export const wergReserveDisplay = derived(bankState, ($bankState) => {
    if (!$bankState) return '—';
    return formatErg($bankState.wergReserve);
});

// ============================================================
// Explorer URI stores
// ============================================================
export const web_explorer_uri_tx = writable(MAINNET_EXPLORER_URI_TX);
export const web_explorer_uri_token = writable(MAINNET_EXPLORER_URI_TOKEN);
export const web_explorer_uri_addr = writable(MAINNET_EXPLORER_URI_ADDR);

// ============================================================
// Helpers
// ============================================================

export function formatErg(nanoErg: bigint): string {
    const whole = nanoErg / NANOERG_PER_ERG;
    const frac = nanoErg % NANOERG_PER_ERG;
    const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
    if (fracStr.length === 0) return whole.toString();
    return `${whole}.${fracStr}`;
}

export function parseErgToNano(ergStr: string): bigint {
    const parts = ergStr.split('.');
    const whole = BigInt(parts[0] || '0');
    let fracStr = (parts[1] || '').padEnd(9, '0').slice(0, 9);
    const frac = BigInt(fracStr);
    return whole * NANOERG_PER_ERG + frac;
}
