import { config } from 'unirep'
import { ethers } from 'ethers'

const attestingFee = ethers.utils.parseEther('0')

const numEpochKeyNoncePerEpoch = config.NUM_EPOCH_KEY_NONCE_PER_EPOCH

const epochLength = 900 // seconds

const globalStateTreeDepth = config.GLOBAL_STATE_TREE_DEPTH

const userStateTreeDepth = config.USER_STATE_TREE_DEPTH

const maxReputationBudget = config.MAX_REPUTATION_BUDGET

const maxUsers = 2 ** globalStateTreeDepth - 1

const maxAttesters = 2 ** userStateTreeDepth - 1

export default {
    attestingFee,
    epochLength,
    numEpochKeyNoncePerEpoch,
    maxUsers,
    maxAttesters,
    maxReputationBudget,
}
