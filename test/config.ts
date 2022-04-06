import { 
    circuitEpochTreeDepth, 
    circuitGlobalStateTreeDepth, 
    circuitUserStateTreeDepth, 
    maxReputationBudget, 
    numEpochKeyNoncePerEpoch 
} from '@unirep/circuits/config'
import { ethers } from 'ethers'

const attestingFee = ethers.utils.parseEther('0.1')

const epochLength = 900 // seconds

const globalStateTreeDepth = circuitGlobalStateTreeDepth

const userStateTreeDepth = circuitUserStateTreeDepth

const epochTreeDepth = circuitEpochTreeDepth

const maxUsers = 2 ** circuitGlobalStateTreeDepth - 1

const maxAttesters = 2 ** circuitUserStateTreeDepth - 1

export const settings = {
    attestingFee,
    epochLength,
    numEpochKeyNoncePerEpoch,
    maxUsers,
    maxAttesters,
    maxReputationBudget,
}

export const treeDepth = {
    epochTreeDepth,
    globalStateTreeDepth,
    userStateTreeDepth,
}