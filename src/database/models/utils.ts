import { ethers } from "ethers";
import { updateDBFromAttestationEvent, updateDBFromCommentSubmittedEvent, updateDBFromEpochEndedEvent, updateDBFromNewGSTLeafInsertedEvent, updateDBFromPostSubmittedEvent } from "../../controllers/utils";

export const initDB = async (
    unirepContract: ethers.Contract,
    unirepSocialContract: ethers.Contract
) => {
    const newGSTLeafInsertedFilter = unirepContract.filters.NewGSTLeafInserted()
    const newGSTLeafInsertedEvents =  await unirepContract.queryFilter(newGSTLeafInsertedFilter)
    const attestationSubmittedFilter = unirepContract.filters.AttestationSubmitted()
    const attestationSubmittedEvents =  await unirepContract.queryFilter(attestationSubmittedFilter)
    const epochEndedFilter = unirepContract.filters.EpochEnded()
    const epochEndedEvents =  await unirepContract.queryFilter(epochEndedFilter)
    const sequencerFilter = unirepContract.filters.Sequencer()
    const sequencerEvents =  await unirepContract.queryFilter(sequencerFilter)

    // proof events
    const signUpFilter = unirepContract.filters.UserSignUp()
    const signUpEvents = await unirepContract.queryFilter(signUpFilter)

    const transitionFilter = unirepContract.filters.UserStateTransitionProof()
    const transitionEvents = await unirepContract.queryFilter(transitionFilter)

    const startTransitionFilter = unirepContract.filters.StartedTransitionProof()
    const startTransitionEvents = await unirepContract.queryFilter(startTransitionFilter)

    const processAttestationsFilter = unirepContract.filters.ProcessedAttestationsProof()
    const processAttestationsEvents = await unirepContract.queryFilter(processAttestationsFilter)

    const epochKeyProofFilter = unirepContract.filters.EpochKeyProof()
    const epochKeyProofEvent = await unirepContract.queryFilter(epochKeyProofFilter)

    const repProofFilter = unirepContract.filters.ReputationNullifierProof()
    const repProofEvent = await unirepContract.queryFilter(repProofFilter)

    const signUpProofFilter = unirepContract.filters.UserSignedUpProof()
    const signUpProofEvent = await unirepContract.queryFilter(signUpProofFilter)

    const proofIndexMap = {}
    const events = signUpEvents.concat(
        transitionEvents, 
        startTransitionEvents, 
        processAttestationsEvents, 
        epochKeyProofEvent, 
        repProofEvent, 
        signUpProofEvent
    )
    for (const event of events) {
        proofIndexMap[Number(event?.args?._proofIndex)] = event
    }

    newGSTLeafInsertedEvents.reverse()
    attestationSubmittedEvents.reverse()
    epochEndedEvents.reverse()

    let latestBlock = 0

    for (let i = 0; i < sequencerEvents.length; i++) {
        const sequencerEvent = sequencerEvents[i]
        const blockNumber = sequencerEvent.blockNumber
        latestBlock = blockNumber
        const occurredEvent = sequencerEvent.args?._event
        if (occurredEvent === "NewGSTLeafInserted") {
            const newLeafEvent = newGSTLeafInsertedEvents.pop()
            if(newLeafEvent !== undefined) await updateDBFromNewGSTLeafInsertedEvent(newLeafEvent)
        } else if (occurredEvent === "AttestationSubmitted") {
            const attestationEvent = attestationSubmittedEvents.pop()
            if(attestationEvent !== undefined) await updateDBFromAttestationEvent(attestationEvent)
        } else if (occurredEvent === "EpochEnded") {
            const epochEndedEvent = epochEndedEvents.pop()
            if(epochEndedEvent !== undefined) await updateDBFromEpochEndedEvent(epochEndedEvent)
        }
    }

    // Unirep Social events
    const postFilter = unirepSocialContract.filters.PostSubmitted()
    const postEvents =  await unirepSocialContract.queryFilter(postFilter)

    const commentFilter = unirepSocialContract.filters.CommentSubmitted()
    const commentEvents =  await unirepSocialContract.queryFilter(commentFilter)

    const voteFilter = unirepSocialContract.filters.VoteSubmitted()
    const voteEvents =  await unirepSocialContract.queryFilter(voteFilter)

    for (const event of postEvents) {
        await updateDBFromPostSubmittedEvent(event)
    }

    for (const event of commentEvents) {
        await updateDBFromCommentSubmittedEvent(event)
    }

    return latestBlock
}