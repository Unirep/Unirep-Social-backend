import { ethers } from "ethers";
import { updateDBFromAttestationEvent, updateDBFromCommentSubmittedEvent, updateDBFromEpochEndedEvent, updateDBFromNewGSTLeafInsertedEvent, updateDBFromPostSubmittedEvent, updateDBFromVoteSubmittedEvent } from "../../controllers/utils";

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

    for (const event of voteEvents) {
        await updateDBFromVoteSubmittedEvent(event)
    }

    return latestBlock
}