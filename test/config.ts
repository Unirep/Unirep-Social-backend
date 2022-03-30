import {
    GLOBAL_STATE_TREE_DEPTH,
    NUM_EPOCH_KEY_NONCE_PER_EPOCH,
    USER_STATE_TREE_DEPTH,
} from '@unirep/config'
import { ethers } from 'ethers'

const attestingFee = ethers.utils.parseEther('0')

const numEpochKeyNoncePerEpoch = NUM_EPOCH_KEY_NONCE_PER_EPOCH

// const numAttestationsPerProof = 5

const epochLength = 900 // seconds

// const circuitGlobalStateTreeDepth = 5

// const circuitUserStateTreeDepth = 5

// const circuitEpochTreeDepth = 32

const globalStateTreeDepth = GLOBAL_STATE_TREE_DEPTH

const userStateTreeDepth = USER_STATE_TREE_DEPTH

// const epochTreeDepth = EPOCH_TREE_DEPTH

const maxReputationBudget = 10

const maxUsers = 2 ** globalStateTreeDepth - 1

const maxAttesters = 2 ** userStateTreeDepth - 1

export default {
    attestingFee,
    //     circuitGlobalStateTreeDepth,
    //     circuitUserStateTreeDepth,
    //     circuitEpochTreeDepth,
    epochLength,
    //     epochTreeDepth,
    //     globalStateTreeDepth,
    numEpochKeyNoncePerEpoch,
    //     numAttestationsPerProof,
    maxUsers,
    maxAttesters,
    //     userStateTreeDepth,
    maxReputationBudget,
}
