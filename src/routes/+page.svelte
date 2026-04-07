<script lang="ts">
    import { onMount } from 'svelte';
    import { getUtxos } from 'wallet-svelte-component';
    import {
        connected,
        bankState,
        bankLoading,
        bankError,
        txPending,
        txError,
        txHistory,
        ergReserveDisplay,
        wergReserveDisplay,
        parseErgToNano
    } from '$lib/ergo/store';
    import { WrappedErgManager, listWrappedErgBanks, type WrappedErgBankSummary } from '$lib/ergo/wrappedErg';
    import type { TxRecord } from '$lib/ergo/store';
    import { EXPLORER_URI_TX } from '$lib/ergo/envs';

    let manager: WrappedErgManager | null = null;

    let wrapAmount = '';
    let unwrapAmount = '';
    let activeTab: 'wrap' | 'unwrap' | 'create' = 'wrap';

    let banks: WrappedErgBankSummary[] = [];
    let banksLoading = false;
    let selectedWergTokenId = '';

    let newBankErg = '1';
    let newBankWergName = 'WERG';
    const ERG_MAX_SUPPLY_DISPLAY = '97,739,925';

    onMount(async () => {
        await refreshBanks();
    });

    $: if ($connected && typeof window !== 'undefined') {
        initManager();
    }

    function getWalletContext() {
        const w = window as any;
        return {
            getUtxos: () => getUtxos(),
            getChangeAddress: async () => {
                return await w.ergo.get_change_address();
            },
            signTx: async (tx: any) => {
                return await w.ergo.sign_tx(tx);
            }
        };
    }

    async function initManager() {
        if (typeof window === 'undefined') return;
        try {
            const w = window as any;
            if (!w.ergo) return;
            manager = new WrappedErgManager(getWalletContext(), selectedWergTokenId || undefined);
            await refreshBankState();
        } catch (e) {
            console.error('Failed to init manager:', e);
        }
    }

    async function refreshBanks() {
        banksLoading = true;
        try {
            banks = await listWrappedErgBanks();
            if (!selectedWergTokenId && banks.length > 0) {
                selectedWergTokenId = banks[0].wergTokenId;
            }
        } catch (e) {
            console.error('Failed to list banks', e);
        } finally {
            banksLoading = false;
        }
    }

    async function selectBank(bank: WrappedErgBankSummary) {
        selectedWergTokenId = bank.wergTokenId;
        if (typeof window !== 'undefined' && $connected) {
            await initManager();
        }
    }

    async function refreshBankState() {
        if (!manager) return;
        $bankLoading = true;
        $bankError = null;
        try {
            $bankState = await manager.getState(selectedWergTokenId || undefined);
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
            const amountNanoErg = parseErgToNano(wrapAmount);
            const txId = await manager.wrap(amountNanoErg);
            const record: TxRecord = {
                txId,
                type: 'wrap',
                amount: wrapAmount,
                timestamp: Date.now(),
                status: 'pending'
            };
            $txHistory = [record, ...$txHistory].slice(0, 20);
            wrapAmount = '';
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
            const amountWerg = parseErgToNano(unwrapAmount);
            const txId = await manager.unwrap(amountWerg);
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

    async function handleCreateBank() {
        if (!manager) return;
        $txPending = true;
        $txError = null;
        try {
            const txId = await manager.createBankWithMint({
                wergName: newBankWergName.trim(),
                initialErgReserve: parseErgToNano(newBankErg)
            });
            const record: TxRecord = {
                txId,
                type: 'create',
                amount: `new bank: ${newBankErg} ERG`,
                timestamp: Date.now(),
                status: 'pending'
            };
            $txHistory = [record, ...$txHistory].slice(0, 20);
            newBankErg = '1';
            await refreshBanks();
        } catch (e: any) {
            $txError = e.message || 'Create bank transaction failed';
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
</script>

<svelte:head>
    <title>Wrapped ERG</title>
    <meta name="description" content="Create, list, wrap and unwrap Wrapped ERG banks on Ergo." />
</svelte:head>

<div class="space-y-8">
    <div class="text-center space-y-4 py-4">
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">Wrapped ERG</h2>
        <p class="text-muted-foreground max-w-2xl mx-auto">
            Discovery, creation, and builder-friendly wrap/unwrap flows for generic bank boxes keyed by wrapper token.
        </p>
    </div>

    <div class="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Banks</h3>
            <button class="text-sm underline" on:click={refreshBanks} disabled={banksLoading}>
                {banksLoading ? 'Refreshing...' : 'Refresh'}
            </button>
        </div>
        {#if banks.length === 0}
            <div class="text-sm text-muted-foreground">No banks found yet.</div>
        {:else}
            <div class="grid grid-cols-1 gap-3">
                {#each banks as bank}
                    <button class="text-left rounded-lg border p-4 hover:bg-secondary/40 {selectedWergTokenId === bank.wergTokenId ? 'border-primary' : 'border-border/50'}" on:click={() => selectBank(bank)}>
                        <div class="font-medium">Wrapper Token: {truncateTxId(bank.wergTokenId)}</div>
                        <div class="text-sm text-muted-foreground">ERG reserve: {bank.ergReserve.toString()}</div>
                        <div class="text-sm text-muted-foreground">WERG reserve: {bank.wergReserve.toString()}</div>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">ERG Reserve</div>
            <div class="text-2xl font-bold font-mono">{#if $bankLoading}<span class="animate-pulse">...</span>{:else}{$ergReserveDisplay}{/if}</div>
        </div>
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">WERG Reserve</div>
            <div class="text-2xl font-bold font-mono">{#if $bankLoading}<span class="animate-pulse">...</span>{:else}{$wergReserveDisplay}{/if}</div>
        </div>
        <div class="rounded-xl border border-border/50 p-5 bg-card">
            <div class="text-sm text-muted-foreground mb-1">Selected Wrapper Token</div>
            <div class="text-sm font-mono break-all">{selectedWergTokenId || '---'}</div>
        </div>
    </div>

    {#if $bankError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{$bankError}</div>
    {/if}

    {#if $connected}
        <div class="rounded-xl border border-border/50 bg-card overflow-hidden max-w-2xl mx-auto">
            <div class="flex border-b border-border/50">
                <button class="flex-1 py-3 text-sm font-medium {activeTab === 'wrap' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground'}" on:click={() => activeTab = 'wrap'}>Wrap</button>
                <button class="flex-1 py-3 text-sm font-medium {activeTab === 'unwrap' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground'}" on:click={() => activeTab = 'unwrap'}>Unwrap</button>
                <button class="flex-1 py-3 text-sm font-medium {activeTab === 'create' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground'}" on:click={() => activeTab = 'create'}>Create Bank</button>
            </div>

            <div class="p-6">
                {#if activeTab === 'wrap'}
                    <div class="space-y-4">
                        <input bind:value={wrapAmount} placeholder="ERG amount" class="w-full px-4 py-3 rounded-lg bg-input border border-border" />
                        <button on:click={handleWrap} disabled={$txPending || !wrapAmount} class="w-full py-3 rounded-lg bg-primary text-primary-foreground">{$txPending ? 'Processing...' : 'Wrap ERG'}</button>
                    </div>
                {:else if activeTab === 'unwrap'}
                    <div class="space-y-4">
                        <input bind:value={unwrapAmount} placeholder="WERG amount" class="w-full px-4 py-3 rounded-lg bg-input border border-border" />
                        <button on:click={handleUnwrap} disabled={$txPending || !unwrapAmount} class="w-full py-3 rounded-lg bg-primary text-primary-foreground">{$txPending ? 'Processing...' : 'Unwrap WERG'}</button>
                    </div>
                {:else}
                    <div class="space-y-5">
                        <p class="text-sm text-muted-foreground">Creates a new bank by minting the wrapper token and deploying the bank box in a single transaction. The bank stores the allowed `wergTokenId` in `R4`.</p>
                        <div>
                            <label for="werg-name" class="block text-sm font-medium mb-1">Wrapper Token Name</label>
                            <input id="werg-name" bind:value={newBankWergName} placeholder="e.g. WERG" class="w-full px-4 py-3 rounded-lg bg-input border border-border" />
                            <p class="text-xs text-muted-foreground mt-1">Name used when minting the wrapper token.</p>
                        </div>
                        <div>
                            <label for="erg-reserve" class="block text-sm font-medium mb-1">Initial ERG Reserve</label>
                            <input id="erg-reserve" bind:value={newBankErg} type="number" min="0.001" step="0.001" placeholder="e.g. 1" class="w-full px-4 py-3 rounded-lg bg-input border border-border" />
                            <p class="text-xs text-muted-foreground mt-1">Amount of ERG to lock in the bank. Supports up to 9 decimal places (1 ERG = 1,000,000,000 nanoERG).</p>
                        </div>
                        <div class="rounded-lg bg-secondary/50 border border-border/50 p-3">
                            <p class="text-sm font-medium">WERG Total Supply: <span class="text-primary font-mono">{ERG_MAX_SUPPLY_DISPLAY} WERG</span></p>
                            <p class="text-xs text-muted-foreground mt-1">Matches the full ERG max supply ({ERG_MAX_SUPPLY_DISPLAY} ERG). The bank box carries only ERG, one wrapper token asset, and `R4` with that token ID.</p>
                        </div>
                        <button on:click={handleCreateBank} disabled={$txPending} class="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium">{$txPending ? 'Processing...' : 'Create Bank'}</button>
                    </div>
                {/if}

                {#if $txError}
                    <div class="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{$txError}</div>
                {/if}
            </div>
        </div>
    {/if}

    {#if $txHistory.length > 0}
        <div class="rounded-xl border border-border/50 bg-card overflow-hidden">
            <div class="px-5 py-4 border-b border-border/50"><h3 class="text-sm font-semibold">Recent Transactions</h3></div>
            <div class="divide-y divide-border/30">
                {#each $txHistory as tx}
                    <div class="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                            <div class="font-medium">{tx.type} --- {tx.amount}</div>
                            <div class="text-xs text-muted-foreground">{formatTimestamp(tx.timestamp)}</div>
                        </div>
                        <a href="{EXPLORER_URI_TX}{tx.txId}" target="_blank" rel="noopener" class="font-mono text-xs text-primary hover:underline">{truncateTxId(tx.txId)}</a>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>
