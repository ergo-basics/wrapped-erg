<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import {
        connected,
        address,
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
    } from '$lib/ergo/store';
    import { NANOERG_PER_ERG } from '$lib/ergo/envs';
    import { WrappedErgManager } from '$lib/ergo/wrappedErg';
    import type { TxRecord } from '$lib/ergo/store';
    import { EXPLORER_URI_TX } from '$lib/ergo/envs';

    let WalletMultiButton: any = null;
    let manager: WrappedErgManager | null = null;

    // Form state
    let wrapAmount = '';
    let unwrapAmount = '';
    let activeTab: 'wrap' | 'unwrap' = 'wrap';

    onMount(async () => {
        // Dynamic import wallet component (only in browser)
        if (browser) {
            try {
                const walletModule = await import('wallet-svelte-component');
                WalletMultiButton = walletModule.default || walletModule.WalletMultiButton;
            } catch (e) {
                console.warn('wallet-svelte-component not available:', e);
            }
        }
    });

    // React to wallet connection
    $: if ($connected && browser) {
        initManager();
    }

    async function initManager() {
        if (!browser) return;
        try {
            const w: any = window;
            const ergoWallet = w.ergoConnector?.nautilus;
            if (!ergoWallet) return;
            
            const ctx = await ergoWallet.getContext();
            manager = new WrappedErgManager(ctx);
            await refreshBankState();
        } catch (e) {
            console.error('Failed to init manager:', e);
        }
    }

    async function refreshBankState() {
        if (!manager) return;
        $bankLoading = true;
        $bankError = null;
        try {
            $bankState = await manager.getState();
        } catch (e: any) {
            $bankError = e.message || 'Failed to fetch bank state';
        } finally {
            $bankLoading = false;
        }
    }

    async function handleWrap() {
        if (!manager || !wrapAmount) return;
        $txPending = true;
        $txError = null;
        try {
            const nanoErg = parseErgToNano(wrapAmount);
            if (nanoErg <= 0n) throw new Error('Amount must be greater than 0');
            
            const txId = await manager.wrap(nanoErg);
            
            const record: TxRecord = {
                txId,
                type: 'wrap',
                amount: wrapAmount,
                timestamp: Date.now(),
                status: 'pending'
            };
            $txHistory = [record, ...$txHistory].slice(0, 20);
            wrapAmount = '';
            
            // Refresh after a delay
            setTimeout(() => refreshBankState(), 3000);
        } catch (e: any) {
            $txError = e.message || 'Wrap transaction failed';
        } finally {
            $txPending = false;
        }
    }

    async function handleUnwrap() {
        if (!manager || !unwrapAmount) return;
        $txPending = true;
        $txError = null;
        try {
            const nanoWerg = parseErgToNano(unwrapAmount);
            if (nanoWerg <= 0n) throw new Error('Amount must be greater than 0');
            
            const txId = await manager.unwrap(nanoWerg);
            
            const record: TxRecord = {
                txId,
                type: 'unwrap',
                amount: unwrapAmount,
                timestamp: Date.now(),
                status: 'pending'
            };
            $txHistory = [record, ...$txHistory].slice(0, 20);
            unwrapAmount = '';
            
            setTimeout(() => refreshBankState(), 3000);
        } catch (e: any) {
            $txError = e.message || 'Unwrap transaction failed';
        } finally {
            $txPending = false;
        }
    }

    function formatTimestamp(ts: number): string {
        return new Date(ts).toLocaleString();
    }

    function truncateTxId(txId: string): string {
        return txId.slice(0, 10) + '...' + txId.slice(-6);
    }

    async function connectWallet() {
        if (!browser) return;
        try {
            const w = window as any;
            const nautilus = w.ergoConnector?.nautilus;
            if (!nautilus) {
                alert('Please install the Nautilus wallet extension');
                return;
            }
            const granted = await nautilus.connect();
            if (granted) {
                $connected = true;
                const ctx = await nautilus.getContext();
                const addr = await ctx.get_change_address();
                $address = addr;
                manager = new WrappedErgManager(ctx);
                await refreshBankState();
            }
        } catch (e) {
            console.error('Connection failed:', e);
        }
    }
</script>

<svelte:head>
    <title>Wrapped ERG — 1:1 ERG ↔ WERG Exchange</title>
    <meta name="description" content="Wrap and unwrap ERG tokens with a 1:1 peg on the Ergo blockchain." />
</svelte:head>

<div class="space-y-8">
    <!-- Hero Section -->
    <div class="text-center space-y-4 py-4">
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">
            ERG ↔ WERG
        </h2>
        <p class="text-muted-foreground max-w-xl mx-auto">
            Wrap and unwrap ERG with a mathematically guaranteed 1:1 peg.
            The smart contract ensures the total ERG + WERG invariant is always preserved.
        </p>
    </div>

    <!-- Wallet Connect -->
    <div class="flex justify-center">
        {#if WalletMultiButton}
            <svelte:component
                this={WalletMultiButton}
                on:connected={(e) => {
                    $connected = true;
                    $address = e.detail?.address || null;
                }}
                on:disconnected={() => {
                    $connected = false;
                    $address = null;
                    manager = null;
                    $bankState = null;
                }}
            />
        {:else}
            <button
                class="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                on:click={connectWallet}
            >
                {$connected ? '✓ Connected' : '🔗 Connect Nautilus Wallet'}
            </button>
        {/if}
    </div>

    <!-- Bank Status -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">ERG Reserve</div>
            <div class="text-2xl font-bold font-mono">
                {#if $bankLoading}
                    <span class="animate-pulse">···</span>
                {:else}
                    {$ergReserveDisplay}
                {/if}
            </div>
            <div class="text-xs text-muted-foreground mt-1">Locked in bank</div>
        </div>
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">WERG Reserve</div>
            <div class="text-2xl font-bold font-mono">
                {#if $bankLoading}
                    <span class="animate-pulse">···</span>
                {:else}
                    {$wergReserveDisplay}
                {/if}
            </div>
            <div class="text-xs text-muted-foreground mt-1">Available to mint</div>
        </div>
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">Exchange Rate</div>
            <div class="text-2xl font-bold font-mono text-primary">1 : 1</div>
            <div class="text-xs text-muted-foreground mt-1">Always guaranteed</div>
        </div>
    </div>

    {#if $bankError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            ⚠️ {$bankError}
            <button on:click={refreshBankState} class="ml-2 underline hover:no-underline">Retry</button>
        </div>
    {/if}

    <!-- Exchange Panel -->
    {#if $connected}
        <div class="rounded-xl border border-border/50 bg-card overflow-hidden max-w-lg mx-auto">
            <!-- Tabs -->
            <div class="flex border-b border-border/50">
                <button
                    class="flex-1 py-3 text-sm font-medium transition-colors {activeTab === 'wrap' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}"
                    on:click={() => activeTab = 'wrap'}
                >
                    ⬆️ Wrap ERG → WERG
                </button>
                <button
                    class="flex-1 py-3 text-sm font-medium transition-colors {activeTab === 'unwrap' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}"
                    on:click={() => activeTab = 'unwrap'}
                >
                    ⬇️ Unwrap WERG → ERG
                </button>
            </div>

            <div class="p-6">
                {#if activeTab === 'wrap'}
                    <!-- Wrap Panel -->
                    <div class="space-y-4">
                        <div>
                            <label for="wrap-amount" class="block text-sm font-medium text-muted-foreground mb-2">
                                Amount (ERG)
                            </label>
                            <div class="relative">
                                <input
                                    id="wrap-amount"
                                    type="text"
                                    inputmode="decimal"
                                    placeholder="0.0"
                                    bind:value={wrapAmount}
                                    class="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground font-mono text-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">ERG</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-center text-muted-foreground">
                            <span class="text-2xl">↓</span>
                        </div>
                        <div class="rounded-lg bg-secondary/50 p-4 text-center">
                            <div class="text-sm text-muted-foreground">You will receive</div>
                            <div class="text-2xl font-bold font-mono mt-1">
                                {wrapAmount || '0'} <span class="text-primary">WERG</span>
                            </div>
                        </div>
                        <button
                            on:click={handleWrap}
                            disabled={$txPending || !wrapAmount}
                            class="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {$txPending ? '⏳ Processing...' : '🔄 Wrap ERG'}
                        </button>
                    </div>
                {:else}
                    <!-- Unwrap Panel -->
                    <div class="space-y-4">
                        <div>
                            <label for="unwrap-amount" class="block text-sm font-medium text-muted-foreground mb-2">
                                Amount (WERG)
                            </label>
                            <div class="relative">
                                <input
                                    id="unwrap-amount"
                                    type="text"
                                    inputmode="decimal"
                                    placeholder="0.0"
                                    bind:value={unwrapAmount}
                                    class="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground font-mono text-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">WERG</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-center text-muted-foreground">
                            <span class="text-2xl">↓</span>
                        </div>
                        <div class="rounded-lg bg-secondary/50 p-4 text-center">
                            <div class="text-sm text-muted-foreground">You will receive</div>
                            <div class="text-2xl font-bold font-mono mt-1">
                                {unwrapAmount || '0'} <span class="text-primary">ERG</span>
                            </div>
                        </div>
                        <button
                            on:click={handleUnwrap}
                            disabled={$txPending || !unwrapAmount}
                            class="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {$txPending ? '⏳ Processing...' : '🔓 Unwrap WERG'}
                        </button>
                    </div>
                {/if}

                {#if $txError}
                    <div class="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        ❌ {$txError}
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="text-center py-8 text-muted-foreground">
            <p class="text-lg">Connect your wallet to start wrapping and unwrapping ERG</p>
            <p class="text-sm mt-2">Requires <a href="https://chrome.google.com/webstore/detail/nautilus-wallet/gjlmehlldlphhljhpnlddaodbjjcchai" target="_blank" rel="noopener" class="underline hover:text-foreground">Nautilus Wallet</a></p>
        </div>
    {/if}

    <!-- Transaction History -->
    {#if $txHistory.length > 0}
        <div class="rounded-xl border border-border/50 bg-card overflow-hidden">
            <div class="px-5 py-4 border-b border-border/50">
                <h3 class="text-sm font-semibold">Recent Transactions</h3>
            </div>
            <div class="divide-y divide-border/30">
                {#each $txHistory as tx}
                    <div class="px-5 py-3 flex items-center justify-between text-sm">
                        <div class="flex items-center gap-3">
                            <span class="text-lg">{tx.type === 'wrap' ? '⬆️' : '⬇️'}</span>
                            <div>
                                <div class="font-medium">
                                    {tx.type === 'wrap' ? 'Wrapped' : 'Unwrapped'} {tx.amount} {tx.type === 'wrap' ? 'ERG → WERG' : 'WERG → ERG'}
                                </div>
                                <div class="text-xs text-muted-foreground">
                                    {formatTimestamp(tx.timestamp)}
                                </div>
                            </div>
                        </div>
                        <a
                            href="{EXPLORER_URI_TX}{tx.txId}"
                            target="_blank"
                            rel="noopener"
                            class="font-mono text-xs text-primary hover:underline"
                        >
                            {truncateTxId(tx.txId)} ↗
                        </a>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- How It Works -->
    <div class="rounded-xl border border-border/50 bg-card p-6 space-y-4">
        <h3 class="text-lg font-semibold">How It Works</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div class="space-y-2">
                <div class="text-2xl">🏦</div>
                <h4 class="font-medium">Bank Box</h4>
                <p class="text-muted-foreground">
                    A smart contract holds both ERG and WERG tokens. An NFT identifies the official bank — there's only one.
                </p>
            </div>
            <div class="space-y-2">
                <div class="text-2xl">🔒</div>
                <h4 class="font-medium">Invariant</h4>
                <p class="text-muted-foreground">
                    The contract enforces: <code class="text-xs bg-secondary px-1 py-0.5 rounded">ERG + WERG = constant</code>. 
                    This mathematically guarantees the 1:1 peg.
                </p>
            </div>
            <div class="space-y-2">
                <div class="text-2xl">⚡</div>
                <h4 class="font-medium">Atomic Swap</h4>
                <p class="text-muted-foreground">
                    Wrapping/unwrapping happens in a single transaction. No counterparty risk, no oracle needed.
                </p>
            </div>
        </div>
    </div>
</div>
