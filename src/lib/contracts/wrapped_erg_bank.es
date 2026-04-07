// Contrato: Wrapped ERG Bank
// Estado por caja:
// R4[Coll[Byte]] = tokenId del wrapper permitido en esta caja

{
    val isBankOutput = OUTPUTS(0).propositionBytes == SELF.propositionBytes
    val exactTokens = SELF.tokens.size == 1 && OUTPUTS(0).tokens.size == 1

    val hasR4 =
        SELF.R4[Coll[Byte]].isDefined &&
        OUTPUTS(0).R4[Coll[Byte]].isDefined

    val selfWergId = SELF.R4[Coll[Byte]].getOrElse(SELF.tokens(0)._1)
    val outWergId = OUTPUTS(0).R4[Coll[Byte]].getOrElse(OUTPUTS(0).tokens(0)._1)

    val selfTokenMatchesRegister = SELF.tokens(0)._1 == selfWergId
    val outTokenMatchesRegister = OUTPUTS(0).tokens(0)._1 == outWergId
    val keepsSameTokenId = selfWergId == outWergId

    val ergIn = SELF.value
    val wergIn = SELF.tokens(0)._2
    val ergOut = OUTPUTS(0).value
    val wergOut = OUTPUTS(0).tokens(0)._2

    val validExchange = (ergOut + wergOut) == (ergIn + wergIn)

    sigmaProp(
        isBankOutput &&
        exactTokens &&
        hasR4 &&
        selfTokenMatchesRegister &&
        outTokenMatchesRegister &&
        keepsSameTokenId &&
        validExchange
    )
}
