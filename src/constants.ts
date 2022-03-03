import dotenv from 'dotenv';
import UnirepSocial from "../node_modules/@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json"
import Unirep from "../node_modules/@unirep/contracts/artifacts/contracts/Unirep.sol/Unirep.json"
import { ethers } from 'ethers';

dotenv.config({
    path: '.env'
});

export const DEPLOYER_PRIV_KEY = process.env.BACKEND_PRIVATE_KEY!;
export const UNIREP = '0x3DdC8069e7d740C86AFfB8bc10Fa66ad10181bd2';
export const UNIREP_SOCIAL = '0x22251B1135379dA965614D83c9FC3D8F012B68CE';
export const MONGODB = 'mongodb://mongo:27017'
const DEFAULT_ETH_PROVIDER_URL = 'ws://localhost:8545';
export const DEFAULT_ETH_PROVIDER = new ethers.providers.WebSocketProvider(DEFAULT_ETH_PROVIDER_URL);
export const DEFAULT_START_BLOCK = 0;
export const UNIREP_SOCIAL_ATTESTER_ID = 1

export const DEFAULT_POST_KARMA = 5
export const DEFAULT_COMMENT_KARMA = 3
export const MAX_KARMA_BUDGET = 10
export const DEFAULT_AIRDROPPED_KARMA = 30
export const DEFAULT_QUERY_DEPTH = 5
export const QUERY_DELAY_TIME = 300

export const identityPrefix = 'Unirep.identity.'
export const identityCommitmentPrefix = 'Unirep.identityCommitment.'
export const epkProofPrefix = 'Unirep.epk.proof.'
export const epkPublicSignalsPrefix = 'Unirep.epk.publicSignals.'
export const reputationProofPrefix = 'Unirep.reputation.proof.'
export const reputationPublicSignalsPrefix = 'Unirep.reputation.publicSignals.'
export const signUpProofPrefix = 'Unirep.signUp.proof.'
export const signUpPublicSignalsPrefix = 'Unirep.signUp.publicSignals.'
export const startUSTProofPrefix = 'Unirep.startUST.proof.'
export const startUSTPublicSignalsPrefix = 'Unirep.startUST.publicSignals.'
export const processUSTProofPrefix = 'Unirep.processUST.proof.'
export const processUSTPublicSignalsPrefix = 'Unirep.processUST.publicSignals.'
export const USTProofPrefix = 'Unirep.UST.proof.'
export const USTPublicSignalsPrefix = 'Unirep.UST.publicSignals.'
export const maxReputationBudget = 10

export const loadPostCount = 10

export const UNIREP_ABI = Unirep.abi
export const UNIREP_SOCIAL_ABI = UnirepSocial.abi

export enum ActionType {
    Post = "Post",
    Comment = "Comment",
    Vote = "Vote",
    UST = "UST",
    Signup = "Signup",
}

export enum QueryType {
    New = 'new',
    Boost = 'boost',
    Comments = 'comments',
    Squash = 'squash',
    Rep = 'rep',
}

export const titlePrefix = '<t>';
export const titlePostfix = '</t>';

export const add0x = (str: string): string => {
    str = str.padStart(64,"0")
    return str.startsWith('0x') ? str : '0x' + str
}
