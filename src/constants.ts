import UnirepSocial from "../node_modules/@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json"
import Unirep from "../node_modules/@unirep/contracts/artifacts/contracts/Unirep.sol/Unirep.json"

export const DEPLOYER_PRIV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const UNIREP = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6';
export const UNIREP_SOCIAL = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
export const DEFAULT_ETH_PROVIDER = 'http://localhost:8545';
export const DEFAULT_START_BLOCK = 0;
export const UNIREP_SOCIAL_ATTESTER_ID = 1

export const DEFAULT_POST_KARMA = 5
export const DEFAULT_COMMENT_KARMA = 3
export const MAX_KARMA_BUDGET = 10
export const DEFAULT_AIRDROPPED_KARMA = 30

export const identityPrefix = 'Unirep.identity.'
export const identityCommitmentPrefix = 'Unirep.identityCommitment.'
export const epkProofPrefix = 'Unirep.epk.proof.'
export const epkPublicSignalsPrefix = 'Unirep.epk.publicSignals.'
export const reputationProofPrefix = 'Unirep.reputation.proof.'
export const reputationPublicSignalsPrefix = 'Unirep.reputation.publicSignals.'
export const signUpProofPrefix = 'Unirep.signUp.proof.'
export const signUpPublicSignalsPrefix = 'Unirep.signUp.publicSignals.'
export const maxReputationBudget = 10

export const loadPostCount = 10

export const UNIREP_ABI = Unirep.abi
export const UNIREP_SOCIAL_ABI = UnirepSocial.abi

export enum ActionType {
    Post = "Post",
    Comment = "Comment",
    Vote = "Vote",
    UST = "UST",
}

export enum QueryType {
    most = 'most',
    fewest = 'fewest',
    newest = 'newest', 
    oldest ='oldest',
    popularity = 'popularity',
    time = 'time',
    reputation = 'reputation',
    votes = 'votes',
    upvotes = 'upvotes',
    comments = 'comments',
    posts = 'posts'
}

export const add0x = (str: string): string => {
    str = str.padStart(64,"0")
    return str.startsWith('0x') ? str : '0x' + str
}
