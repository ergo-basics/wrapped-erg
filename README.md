# wrapped-erg
Wrapped Erg token contract + app + reusable library API

Based on https://github.com/ergo-basics/template

## Current scope

This repo now targets three use cases:

- wrapped ERG web app
- bank discovery + bank creation UX
- reusable `index.ts` library exports for other Ergo apps

### Library-first additions

The public API now includes:

- `WrappedErgManager`
- `listWrappedErgBanks()`
- `buildCreateBankTx(...)`
- `buildWrapTx(...)`
- `buildUnwrapTx(...)`

Those `build*` methods return unsigned tx objects so downstream apps can support chained transaction flows.

See `LIBRARY.md` for usage.


### 1. El Contrato Inteligente (ErgoScript)

Este script controla la "Caja Banco". Su única regla es matemática: **El total de ERG + WERG en la caja debe ser exactamente igual antes y después de cualquier transacción.** Esto garantiza matemáticamente el respaldo 1:1.

```scala
// Contrato: Wrapped ERG Bank
// Constantes inyectadas al compilar:
// _BankNFT: Coll[Byte] - ID del NFT que identifica la caja banco oficial
// _WergID:  Coll[Byte] - ID del token WERG

{
    // 1. La caja de salida en la posición 0 debe ser la nueva Caja Banco (mismo script)
    val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
    
    // 2. La caja debe mantener exactamente 2 tokens: [0] = BankNFT, [1] = WERG
    val exactTokens = OUTPUTS(0).tokens.size == 2
    val keepsNFT    = OUTPUTS(0).tokens(0)._1 == _BankNFT
    val keepsWergID = OUTPUTS(0).tokens(1)._1 == _WergID
    
    // 3. Obtener balances de entrada (SELF) y salida (OUTPUTS(0))
    val ergIn  = SELF.value
    val wergIn = SELF.tokens(1)._2
    
    val ergOut  = OUTPUTS(0).value
    val wergOut = OUTPUTS(0).tokens(1)._2
    
    // 4. EL INVARIANTE MÁGICO: La suma total de ERG y WERG dentro de la caja no cambia.
    // Si metes 10 ERG, debes sacar exactamente 10 WERG para que la ecuación se cumpla.
    val validExchange = (ergOut + wergOut) == (ergIn + wergIn)
    
    // Ejecutar la validación
    sigmaProp(isBankOutput && exactTokens && keepsNFT && keepsWergID && validExchange)
}
```

---

### 2. La Aplicación Manager (TypeScript)

Para la aplicación off-chain, usaremos `@fleet-sdk/core`, que es el estándar actual para construir transacciones en Ergo.

```typescript
import { TransactionBuilder, ErgoAddress, OutputBuilder, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { compile } from "@fleet-sdk/compiler";

// Interfaces basadas en tu pseudocódigo
export interface WergState {
    boxId: string;
    ergReserve: bigint;    // Cantidad de nanoERGs en la caja
    wergReserve: bigint;   // Cantidad de WERG en la caja
    script: string;
}

export class WrappedErgManager {
    private readonly bankNFT: string;
    private readonly wergTokenId: string;
    private readonly bankTree: string; // ErgoTree compilado del ErgoScript
    private readonly explorer: any;    // API hipotética (ej. Ergo GraphQL / Explorer API)
    private readonly wallet: any;      // Billetera conectada (ej. Nautilus dApp Connector)

    constructor(bankNFT: string, wergTokenId: string, explorerApi: any, wallet: any) {
        this.bankNFT = bankNFT;
        this.wergTokenId = wergTokenId;
        this.explorer = explorerApi;
        this.wallet = wallet;

        // Compilamos el script inyectando las constantes
        this.bankTree = compile(`
            {
                val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
                val exactTokens = OUTPUTS(0).tokens.size == 2
                val keepsNFT    = OUTPUTS(0).tokens(0)._1 == fromBase16("${this.bankNFT}")
                val keepsWergID = OUTPUTS(0).tokens(1)._1 == fromBase16("${this.wergTokenId}")
                
                val ergIn  = SELF.value
                val wergIn = SELF.tokens(1)._2
                val ergOut  = OUTPUTS(0).value
                val wergOut = OUTPUTS(0).tokens(1)._2
                
                val validExchange = (ergOut + wergOut) == (ergIn + wergIn)
                
                sigmaProp(isBankOutput && exactTokens && keepsNFT && keepsWergID && validExchange)
            }
        `).toHex();
    }

    /**
     * fetchTokensWERG (Equivalente al pseudocódigo)
     * Busca la caja actual en la blockchain que contiene el NFT del banco
     */
    async fetchBankBox(): Promise<any> {
        // En Ergo, la caja "Banco" es un Singleton gracias al NFT. Solo existe UNA.
        const unspentBoxes = await this.explorer.getUnspentBoxesByTokenId(this.bankNFT);
        if (unspentBoxes.length === 0) throw new Error("Caja WERG no encontrada en la red");
        return unspentBoxes[0];
    }

    /**
     * Muestra el estado actual del banco WERG (ERG Equivalente vs T)
     */
    async mostrarWERG(): Promise<WergState> {
        const bankBox = await this.fetchBankBox();
        const wergToken = bankBox.assets.find((t: any) => t.tokenId === this.wergTokenId);

        return {
            boxId: bankBox.boxId,
            ergReserve: BigInt(bankBox.value),
            wergReserve: BigInt(wergToken.amount),
            script: bankBox.ergoTree
        };
    }

    /**
     * Intercambio ERG -> T (Wrap)
     */
    async wrap(amountNanoErg: bigint): Promise<string> {
        const bankBox = await this.fetchBankBox();
        const userUtxos = await this.wallet.getUtxos();
        const changeAddress = await this.wallet.getChangeAddress();
        const currentHeight = await this.explorer.getCurrentHeight();

        const currentWergAmount = BigInt(bankBox.assets.find((t: any) => t.tokenId === this.wergTokenId).amount);
        const currentErgAmount = BigInt(bankBox.value);

        // Validar que hay suficiente WERG en el banco
        if (currentWergAmount < amountNanoErg) throw new Error("El banco no tiene suficiente WERG");

        // Creamos la nueva Caja Banco
        const newBankBox = new OutputBuilder(currentErgAmount + amountNanoErg, this.bankTree)
            .addTokens({ tokenId: this.bankNFT, amount: 1n })
            .addTokens({ tokenId: this.wergTokenId, amount: currentWergAmount - amountNanoErg });

        // Construir la transacción
        const unsignedTx = new TransactionBuilder(currentHeight)
            .from([bankBox, ...userUtxos]) // Inputs: [0] es la Caja Banco, [1..n] las del usuario
            .to(newBankBox)                // Output [0]: La nueva Caja Banco actualizada
            .sendChangeTo(changeAddress)   // El sobrante y los tokens WERG van al usuario
            .payMinFee()
            .build()
            .toEIP12Object();

        // Firmar y enviar
        const signedTx = await this.wallet.signTx(unsignedTx);
        const txId = await this.explorer.submitTx(signedTx);
        return txId;
    }

    /**
     * Intercambio T -> ERG (Unwrap)
     */
    async unwrap(amountWerg: bigint): Promise<string> {
        const bankBox = await this.fetchBankBox();
        const userUtxos = await this.wallet.getUtxos();
        const changeAddress = await this.wallet.getChangeAddress();
        const currentHeight = await this.explorer.getCurrentHeight();

        const currentWergAmount = BigInt(bankBox.assets.find((t: any) => t.tokenId === this.wergTokenId).amount);
        const currentErgAmount = BigInt(bankBox.value);

        // Validar que el banco tenga suficiente ERG
        if (currentErgAmount < amountWerg) throw new Error("El banco no tiene suficiente ERG");

        // Creamos la nueva Caja Banco
        const newBankBox = new OutputBuilder(currentErgAmount - amountWerg, this.bankTree)
            .addTokens({ tokenId: this.bankNFT, amount: 1n })
            .addTokens({ tokenId: this.wergTokenId, amount: currentWergAmount + amountWerg });

        // Construir la transacción
        const unsignedTx = new TransactionBuilder(currentHeight)
            .from([bankBox, ...userUtxos]) // El usuario provee sus cajas que contienen el WERG
            .to(newBankBox)
            .sendChangeTo(changeAddress)   // El ERG liberado va automáticamente a la dirección de cambio
            .payMinFee()
            .build()
            .toEIP12Object();

        const signedTx = await this.wallet.signTx(unsignedTx);
        const txId = await this.explorer.submitTx(signedTx);
        return txId;
    }
}
```
