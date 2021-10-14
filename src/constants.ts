export const DEPLOYER_PRIV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const UNIREP_SOCIAL = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
export const DEFAULT_ETH_PROVIDER = 'http://localhost:8545'

export const identityPrefix = 'Unirep.identity.'
export const identityCommitmentPrefix = 'Unirep.identityCommitment.'
export const epkProofPrefix = 'Unirep.epk.proof.'
export const epkPublicSignalsPrefix = 'Unirep.epk.publicSignals.'
export const reputationProofPrefix = 'Unirep.reputation.proof.'
export const reputationPublicSignalsPrefix = 'Unirep.reputation.publicSignals.'
export const signUpProofPrefix = 'Unirep.signUp.proof.'
export const signUpPublicSignalsPrefix = 'Unirep.signUp.publicSignals.'
export const maxReputationBudget = 10

export const add0x = (str: string): string => {
    str = str.padStart(64,"0")
    return str.startsWith('0x') ? str : '0x' + str
}