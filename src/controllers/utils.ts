import { ethers } from 'ethers'
import { Circuit, verifyProof } from '@unirep/circuits'
import {
    ReputationProof,
    SignUpProof,
    UserTransitionProof,
} from '@unirep/contracts'
import Record from '../database/models/record'
import Nullifier from '../database/models/nullifiers'
import Epoch from '../database/models/epoch'
import GSTRoot from '../database/models/GSTRoots'
import BlockNumber from '../database/models/blockNumber'
import Synchronizer from '../daemons/Synchronizer'
import { DEFAULT_ETH_PROVIDER } from '../constants'

const processNewEvents = async () => {
    const latestBlock = await DEFAULT_ETH_PROVIDER.getBlockNumber()
    const latestProcessed = await BlockNumber.findOne()
    const blockNumber = latestProcessed === null ? 0 : latestProcessed.number
    if (latestBlock == blockNumber) return
    const allEvents = (
        await Promise.all([
            Synchronizer.unirepContract.queryFilter(
                Synchronizer.unirepFilter,
                blockNumber + 1,
            ),
            Synchronizer.unirepSocialContract.queryFilter(
                Synchronizer.unirepSocialFilter,
                blockNumber + 1,
            ),
        ])
    ).flat() as ethers.Event[]
    // first process historical ones then listen
    await Synchronizer.processEvents(allEvents)
}

const verifyGSTRoot = async (
    epoch: number,
    gstRoot: string
): Promise<boolean> => {
    const exists = await GSTRoot.exists({
        epoch,
        root: gstRoot,
    })
    if (exists) return exists
    else {
        await processNewEvents()
        const exists = await GSTRoot.exists({
            epoch,
            root: gstRoot,
        })
        console.log(await GSTRoot.find())
        return exists
    }
}

const verifyEpochTreeRoot = async (
    epoch: number,
    epochTreeRoot: string
) => {
    const exists = await Epoch.exists({
        epoch,
        epochRoot: epochTreeRoot,
    })
    if (exists) return exists
    else {
        await processNewEvents()
        const exists = await Epoch.exists({
            epoch,
            epochRoot: epochTreeRoot,
        })
        return exists
    }
}

const verifyReputationProof = async (
    reputationProof: ReputationProof,
    spendReputation: number,
    unirepSocialId: number,
    currentEpoch: number
): Promise<string | undefined> => {
    const repNullifiers = reputationProof.repNullifiers.map((n) => n.toString())
    const epoch = Number(reputationProof.epoch)
    const gstRoot = reputationProof.globalStateTree.toString()
    const attesterId = Number(reputationProof.attesterId)
    const repNullifiersAmount = Number(reputationProof.proveReputationAmount)

    // check if epoch is correct
    if (epoch !== Number(currentEpoch)) {
        return 'Error: epoch of the proof mismatches current epoch'
    }

    // check attester ID
    if (Number(unirepSocialId) !== attesterId) {
        return 'Error: proof with wrong attester ID'
    }

    // check reputation amount
    if (repNullifiersAmount !== spendReputation) {
        return 'Error: proof with wrong reputation amount'
    }

    const isProofValid = await reputationProof.verify()
    if (!isProofValid) {
        return 'Error: invalid reputation proof'
    }

    // check GST root
    {
        const exists = await verifyGSTRoot(epoch, gstRoot)
        if (!exists) {
            return `Global state tree root ${gstRoot} is not in epoch ${epoch}`
        }
    }

    // check nullifiers
    const exists = await Nullifier.exists({
        nullifier: {
            $in: repNullifiers,
        },
    })
    if (exists) {
        return `Error: duplicate reputation nullifier`
    }
}

const verifyAirdropProof = async (
    signUpProof: SignUpProof,
    unirepSocialId: number,
    currentEpoch: number
): Promise<string | undefined> => {
    const epoch = Number(signUpProof.epoch)
    const epk = signUpProof.epochKey.toString(16)
    const gstRoot = signUpProof.globalStateTree.toString()
    const attesterId = signUpProof.attesterId
    const userHasSignedUp = signUpProof.userHasSignedUp

    // check if epoch is correct
    if (epoch !== Number(currentEpoch)) {
        return 'Error: epoch of the proof mismatches current epoch'
    }

    // check attester ID
    if (Number(unirepSocialId) !== Number(attesterId)) {
        return 'Error: proof with wrong attester ID'
    }

    // Check if user has signed up in Unirep Social
    if (Number(userHasSignedUp) === 0) {
        return 'Error: user has not signed up in Unirep Social'
    }

    const isProofValid = await signUpProof.verify()
    if (!isProofValid) {
        return 'Error: invalid user sign up proof'
    }

    // check GST root
    {
        const exists = await verifyGSTRoot(epoch, gstRoot)
        if (!exists) {
            return `Global state tree root ${gstRoot} is not in epoch ${epoch}`
        }
    }

    // Has been airdropped before
    const findRecord = await Record.findOne({ to: epk, from: 'UnirepSocial' })
    if (findRecord) {
        return `Error: the epoch key has been airdropped`
    }
}

const verifyUSTProof = async (
    results: any,
    currentEpoch: number
): Promise<string | undefined> => {
    let error
    // Check if the fromEpoch is less than the current epoch
    if (
        Number(results.finalTransitionProof.transitionedFromEpoch) >=
        currentEpoch
    ) {
        error = 'Error: user transitions from an invalid epoch'
        return error
    }

    // Start user state transition proof
    let isValid = await verifyProof(
        Circuit.startTransition,
        results.startTransitionProof.proof,
        results.startTransitionProof.publicSignals
    )
    if (!isValid) {
        error = 'Error: start state transition proof generated is not valid!'
        return error
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
            return error
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
        return error
    }

    // Check epoch tree root
    const epoch = Number(results.finalTransitionProof.transitionedFromEpoch)
    const gstRoot = results?.finalTransitionProof?.fromGSTRoot
    const epochTreeRoot = results.finalTransitionProof.fromEpochTree
    {
        const exists = await verifyGSTRoot(epoch, gstRoot)
        if (!exists) {
            error = `Global state tree root ${gstRoot} is not in epoch ${epoch}`
            return error
        }
    }
    {
        const exists = await verifyEpochTreeRoot(epoch, epochTreeRoot)
        if (!exists) {
            error = `Epoch tree root ${epochTreeRoot} is not in epoch ${epoch}`
            return error
        }
    }

    // check nullifiers
    const exists = await Nullifier.exists({
        nullifier: {
            $in: results.finalTransitionProof.epochKeyNullifiers,
        },
    })
    if (exists) {
        error = `Error: invalid reputation nullifier`
    }
    return error
}

export { verifyReputationProof, verifyUSTProof, verifyAirdropProof }
