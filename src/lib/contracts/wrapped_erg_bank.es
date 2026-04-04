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
