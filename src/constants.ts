import dotenv from 'dotenv';
import UnirepSocial from "@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json"
import Unirep from "@unirep/contracts/artifacts/contracts/Unirep.sol/Unirep.json"
import { ethers } from 'ethers';

// load the environment variables from the .env file
dotenv.config();

// Provide default values for process.env
Object.assign(process.env, {
    UNIREP: '0x3DdC8069e7d740C86AFfB8bc10Fa66ad10181bd2',
    UNIREP_SOCIAL: '0x22251B1135379dA965614D83c9FC3D8F012B68CE',
    DEFAULT_ETH_PROVIDER_URL: 'ws://localhost:8546',
    ...process.env
})

export const {
    DEPLOYER_PRIV_KEY,
    UNIREP,
    UNIREP_SOCIAL,
    DEFAULT_ETH_PROVIDER_URL,
} = process.env as any

// export const UNIREP = '0xE7709F35fb195E1D117D486aEB24bA58CEccCD29';
// export const UNIREP_SOCIAL = '0x0F50453236B2Ca88D5C1fBC8D7FA91001d93eC68';
// const DEFAULT_ETH_PROVIDER_URL = 'wss://eth-goerli.alchemyapi.io/v2/tYp-IJU_idg28iohx9gsLqhq6KRZxk7f';
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
