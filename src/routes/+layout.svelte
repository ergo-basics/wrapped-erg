<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { WalletButton, WalletModal, walletConnected, walletAddress } from 'wallet-svelte-component';
    import { connected, address } from '$lib/ergo/store';

    let darkMode = true;

    function toggleTheme() {
        darkMode = !darkMode;
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    onMount(() => {
        document.documentElement.classList.add('dark');
    });

    // Sync wallet-svelte-component stores to our local stores
    $: $connected = $walletConnected;
    $: $address = $walletAddress;
</script>

<div class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="container flex h-16 items-center justify-between px-4 mx-auto max-w-5xl">
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                    <img src="/favicon.svg" alt="Wrapped ERG" class="h-7 w-7" />
                    <h1 class="text-xl font-bold tracking-tight">
                        Wrapped <span class="text-primary">ERG</span>
                    </h1>
                </div>
                <span class="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50">
                    1:1 Peg
                </span>
            </div>

            <div class="flex items-center gap-3">
                <WalletButton />
                <button
                    on:click={toggleTheme}
                    class="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 border border-border hover:bg-secondary transition-colors"
                    title="Toggle theme"
                >
                    {darkMode ? '☀️' : '🌙'}
                </button>
            </div>
        </div>
    </header>

    <WalletModal />

    <main class="container mx-auto max-w-5xl px-4 py-8">
        <slot />
    </main>

    <footer class="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <div class="container mx-auto max-w-5xl px-4">
            <p>Wrapped ERG — 1:1 ERG ↔ WERG Exchange on Ergo Blockchain</p>
            <p class="mt-1">
                Built with
                <a href="https://github.com/ergo-basics/template" target="_blank" rel="noopener" class="underline hover:text-foreground transition-colors">
                    ergo-basics/template
                </a>
            </p>
        </div>
    </footer>
</div>
