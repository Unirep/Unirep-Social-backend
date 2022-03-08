import { Circuit, verifyProof } from '@unirep/circuits';
import { ReputationProof, SignUpProof, UserTransitionProof } from '@unirep/contracts';
import Record from '../database/models/record';
import { epochTreeRootExists, GSTRootExists, nullifierExists } from '../database/utils';

const verifyReputationProof = async(
    reputationProof: ReputationProof,
    spendReputation: number,
    unirepSocialId: number,
    currentEpoch: number
): Promise<string | undefined> => {
    let error
    const repNullifiers = reputationProof.repNullifiers.map(n => n.toString())
    const epoch = Number(reputationProof.epoch)
    const GSTRoot = reputationProof.globalStateTree.toString()
    const attesterId = Number(reputationProof.attesterId)
    const repNullifiersAmount = Number(reputationProof.proveReputationAmount)

    // check if epoch is correct
    if(epoch !== Number(currentEpoch)) {
        error = 'Error: epoch of the proof mismatches current epoch'
    }

    // check attester ID
    if(Number(unirepSocialId) !== attesterId) {
        error = 'Error: proof with wrong attester ID'
      }

    // check reputation amount
    if(repNullifiersAmount !== spendReputation) {
        error = 'Error: proof with wrong reputation amount'
    }

    const isProofValid = await reputationProof.verify()
    if (!isProofValid) {
        error = 'Error: invalid reputation proof'
    }

    // check GST root
    const validRoot = await GSTRootExists(epoch, GSTRoot)
    if(!validRoot){
        error = `Error: global state tree root ${GSTRoot} is not in epoch ${epoch}`
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

const verifyAirdropProof = async(signUpProof: SignUpProof, unirepSocialId: number, currentEpoch: number): Promise<string | undefined> => {
    let error
    const epoch = Number(signUpProof.epoch)
    const epk = signUpProof.epochKey.toString(16)
    const GSTRoot = signUpProof.globalStateTree.toString()
    const attesterId = signUpProof.attesterId
    const userHasSignedUp = signUpProof.userHasSignedUp

    // check if epoch is correct
    if(epoch !== Number(currentEpoch)) {
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

    const isProofValid = await signUpProof.verify()
    if (!isProofValid) {
        error = 'Error: invalid user sign up proof'
    }

    // check GST root
    const validRoot = await GSTRootExists(epoch, GSTRoot)
    if(!validRoot){
        error = `Error: global state tree root ${GSTRoot} is not in epoch ${epoch}`
    }

    // Has been airdropped before
    const findRecord = await Record.findOne({to: epk, from: "UnirepSocial"})
    if(findRecord){
        error = `Error: the epoch key has been airdropped`
    }

    return error
}

const verifyUSTProof = async(results: any, currentEpoch: number): Promise<string | undefined> => {
    let error
    // Check if the fromEpoch is less than the current epoch
    if (Number(results.finalTransitionProof.transitionedFromEpoch) >= currentEpoch) {
        error = 'Error: user transitions from an invalid epoch';
        return error;
    }

    // Start user state transition proof
    let isValid = await verifyProof(
        Circuit.startTransition,
        results.startTransitionProof.proof,
        results.startTransitionProof.publicSignals
    )
    if (!isValid) {
        error = 'Error: start state transition proof generated is not valid!'
        return error;
    }

    // Process attestations proofs
    for (let i = 0; i < results.processAttestationProofs.length; i++) {
        const isValid = await verifyProof(
            Circuit.processAttestations,
            results.processAttestationProofs[i].proof,
            results.processAttestationProofs[i].publicSignals
        )
        if (!isValid) {
            error = 'Error: process attestations proof generated is not valid!'
            return error;
        }
    }

    // User state transition proof
    const USTProof = new UserTransitionProof(
        results.finalTransitionProof.publicSignals,
        results.finalTransitionProof.proof
    )
    isValid = await USTProof.verify()
    if (!isValid) {
        error = 'Error: user state transition proof generated is not valid!'
        return error;
    }

    // Check epoch tree root
    const epoch = Number(results.finalTransitionProof.transitionedFromEpoch)
    const GSTRoot = results?.finalTransitionProof?.fromGSTRoot
    const epochTreeRoot = results.finalTransitionProof.fromEpochTree
    const isGSTExisted = await GSTRootExists(epoch, GSTRoot)
    const isEpochTreeExisted = await epochTreeRootExists(epoch, epochTreeRoot)
    if(!isGSTExisted) {
        error = `Global state tree root ${GSTRoot} is not in epoch ${epoch}`
        return error;
    }
    if(!isEpochTreeExisted){
        error = `Epoch tree root ${epochTreeRoot} is not in epoch ${epoch}`
        return error;
    }

    // check nullifiers
    for (let nullifier of results.finalTransitionProof.epochKeyNullifiers) {
        const seenNullifier = await nullifierExists(nullifier)
        if(seenNullifier) {
            error = `Error: invalid reputation nullifier ${nullifier}`
            return error;
        }
    }
    return error;
}

export {
    GSTRootExists,
    epochTreeRootExists,
    nullifierExists,
    verifyReputationProof,
    verifyUSTProof,
    verifyAirdropProof,
}
