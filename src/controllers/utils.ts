import { CircuitName, verifyProof } from '@unirep/circuits';
import { formatProofForSnarkjsVerification } from '@unirep/unirep';
import { maxReputationBudget } from '../constants';
import Record from '../database/models/record';
import { epochTreeRootExists, GSTRootExists, nullifierExists } from '../database/utils';

const verifyReputationProof = async(publicSignals: string, proof: string, spendReputation: number, unirepSocialId: number, currentEpoch: number): Promise<string | undefined> => {
    let error
    const repNullifiers = publicSignals.slice(0, maxReputationBudget)
    const epoch = publicSignals[maxReputationBudget]
    const GSTRoot = publicSignals[maxReputationBudget + 2]
    const attesterId = publicSignals[maxReputationBudget + 3]
    const repNullifiersAmount = publicSignals[maxReputationBudget + 4]

    // check if epoch is correct
    if(Number(epoch) != Number(currentEpoch)) {
        error = 'Error: epoch of the proof mismatches current epoch'
    }

    // check attester ID
    if(Number(unirepSocialId) !== Number(attesterId)) {
        error = 'Error: proof with wrong attester ID'
      }

    // check reputation amount
    if(Number(repNullifiersAmount) !== spendReputation) {
        error = 'Error: proof with wrong reputation amount'
    }

    const isProofValid = await verifyProof(CircuitName.proveReputation, formatProofForSnarkjsVerification(proof), publicSignals)
    if (!isProofValid) {
        error = 'Error: invalid reputation proof'
    }

    // check GST root
    const validRoot = await GSTRootExists(Number(epoch), GSTRoot)
    if(!validRoot){
        error = `Error: global state tree root ${GSTRoot} is not in epoch ${Number(epoch)}`
    }

    // check nullifiers
    for (let nullifier of repNullifiers) {
        const seenNullifier = await nullifierExists(nullifier)
        if(seenNullifier) {
            error = `Error: invalid reputation nullifier ${nullifier}`
        }
    }
    return error
}

const verifyAirdropProof = async(publicSignals: string, proof: string, unirepSocialId: number, currentEpoch: number): Promise<string | undefined> => {
    let error
    const epoch = publicSignals[0]
    const epk = BigInt(publicSignals[1]).toString(16)
    const GSTRoot = publicSignals[2]
    const attesterId = publicSignals[3]
    const userHasSignedUp = publicSignals[4]

    // check if epoch is correct
    if(Number(epoch) != Number(currentEpoch)) {
        error = 'Error: epoch of the proof mismatches current epoch'
    }

    // check attester ID
    if(Number(unirepSocialId) !== Number(attesterId)) {
        error = 'Error: proof with wrong attester ID'
    }

    // Check if user has signed up in Unirep Social
    if(Number(userHasSignedUp) === 0) {
        error = 'Error: user has not signed up in Unirep Social'
    }

    const isProofValid = await verifyProof(CircuitName.proveUserSignUp, formatProofForSnarkjsVerification(proof), publicSignals)
    if (!isProofValid) {
        error = 'Error: invalid user sign up proof'
    }

    // check GST root
    const validRoot = await GSTRootExists(Number(epoch), GSTRoot)
    if(!validRoot){
        error = `Error: global state tree root ${GSTRoot} is not in epoch ${Number(epoch)}`
    }

    // Has been airdropped before
    const findRecord = await Record.findOne({to: epk, from: "UnirepSocial"})
    if(findRecord){
        error = `Error: the epoch key has been airdropped`
    }

    return error
}

const verifyUSTProof = async(results): Promise<string | undefined> => {
    let error
    // Start user state transition proof
    let isValid = await verifyProof(CircuitName.startTransition, results.startTransitionProof.proof, results.startTransitionProof.publicSignals)
    if (!isValid) {
        error = 'Error: start state transition proof generated is not valid!'
    }

    // Process attestations proofs
    for (let i = 0; i < results.processAttestationProofs.length; i++) {
        const isValid = await verifyProof(CircuitName.processAttestations, results.processAttestationProofs[i].proof, results.processAttestationProofs[i].publicSignals)
        if (!isValid) {
            error = 'Error: process attestations proof generated is not valid!'
        }
    }

    // User state transition proof
    isValid = await verifyProof(CircuitName.userStateTransition, results.finalTransitionProof.proof, results.finalTransitionProof.publicSignals)
    if (!isValid) {
        error = 'Error: user state transition proof generated is not valid!'
    }

    // Check epoch tree root
    const epoch = Number(results.finalTransitionProof.transitionedFromEpoch)
    const GSTRoot = results?.finalTransitionProof?.fromGSTRoot
    const epochTreeRoot = results.finalTransitionProof.fromEpochTree
    const isGSTExisted = await GSTRootExists(epoch, GSTRoot)
    const isEpochTreeExisted = await epochTreeRootExists(epoch, epochTreeRoot)
    if(!isGSTExisted) {
        error = 'Global state tree root mismatches'
    }
    if(!isEpochTreeExisted){
        error = 'Epoch tree root mismatches'
    }

    // check nullifiers
    for (let nullifier of results.finalTransitionProof.epochKeyNullifiers) {
        const seenNullifier = await nullifierExists(nullifier)
        if(seenNullifier) {
            error = `Error: invalid reputation nullifier ${nullifier}`
        }
    }
    return error
}

export {
    GSTRootExists,
    epochTreeRootExists,
    nullifierExists,
    verifyReputationProof,
    verifyUSTProof,
    verifyAirdropProof,
}