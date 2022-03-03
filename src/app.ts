import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import EpochManager from './EpochManager'

import ErrorHandler from './ErrorHandler';
import MasterRouter from './routers/MasterRouter';

import { DEFAULT_ETH_PROVIDER, UNIREP, UNIREP_ABI, UNIREP_SOCIAL, UNIREP_SOCIAL_ABI } from './constants';
import { initDB, updateDBFromAirdropSubmittedEvent, updateDBFromAttestationEvent, updateDBFromCommentSubmittedEvent, updateDBFromEpochEndedEvent, updateDBFromEpochKeyProofEvent, updateDBFromPostSubmittedEvent, updateDBFromProcessAttestationProofEvent, updateDBFromReputationProofEvent, updateDBFromStartUSTProofEvent, updateDBFromUnirepUserSignUpEvent, updateDBFromUserSignedUpProofEvent, updateDBFromUserSignUpEvent, updateDBFromUSTEvent, updateDBFromUSTProofEvent, updateDBFromVoteSubmittedEvent } from './database/utils';

main()
  .catch(err => {
    console.log(`Uncaught error: ${err}`)
    process.exit(1)
  })

async function main() {
    // try database connection
    const mongoDB = 'mongodb://127.0.0.1:27017/unirep_social';
    mongoose.connect(mongoDB);
    // Bind connection to error event (to get notification of connection errors)
    mongoose.connection
      .on('error', console.error.bind(console, 'MongoDB connection error:'));

    // now start listening for eth events
    await startEventListeners()

    // start watching for epoch transitions
    await EpochManager.updateWatch()

    // now start the http server
    const app = express()
    app.use(cors());
    app.use(express.json());
    app.use('/api', MasterRouter);
    // make server app handle any error
    app.use((err: ErrorHandler, req: Request, res: Response, next: NextFunction) => {
        res.status(err.statusCode || 500).json({
            status: 'error',
            statusCode: err.statusCode,
            message: err.message
        });
    });
    const port = process.env.APP_PORT ?? 5000
    app.listen(port, () => console.log(`> Listening on port ${port}`));
}

async function startEventListeners() {
    // Initialize ethers provider
    const provider = DEFAULT_ETH_PROVIDER
    const unirepSocialContract = new ethers.Contract(
        UNIREP_SOCIAL,
        UNIREP_SOCIAL_ABI,
        provider,
    )
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        provider,
    )
    const UserSignedUpFilter = unirepContract.filters.UserSignedUp()
    const UserStateTransitionedFilter = unirepContract.filters.UserStateTransitioned()
    const AttestationSubmittedFilter = unirepContract.filters.AttestationSubmitted()
    const EpochEndedFilter = unirepContract.filters.EpochEnded()

    const epochKeyProofFilter = unirepContract.filters.IndexedEpochKeyProof()
    const reputationProofFilter = unirepContract.filters.IndexedReputationProof()
    const signUpProofFilter = unirepContract.filters.IndexedUserSignedUpProof()
    const startTransitionFilter = unirepContract.filters.IndexedStartedTransitionProof()
    const processAttestationsFilter = unirepContract.filters.IndexedProcessedAttestationsProof()
    const userStateTransitionFilter = unirepContract.filters.IndexedUserStateTransitionProof()

    const userSignUpFilter = unirepSocialContract.filters.UserSignedUp()
    const postFilter = unirepSocialContract.filters.PostSubmitted()
    const commentFilter = unirepSocialContract.filters.CommentSubmitted()
    const voteFilter = unirepSocialContract.filters.VoteSubmitted()
    const airdropFilter = unirepSocialContract.filters.AirdropSubmitted()
    const startBlock = await initDB(unirepContract, unirepSocialContract)
    console.log('start block', startBlock)
    provider.on(
        UserSignedUpFilter, (event) => updateDBFromUnirepUserSignUpEvent(event, startBlock)
    )
    provider.on(
        UserStateTransitionedFilter, (event) => updateDBFromUSTEvent(event, startBlock)
    )
    provider.on(
        AttestationSubmittedFilter, (event) => updateDBFromAttestationEvent(event, startBlock)
    )
    provider.on(
        EpochEndedFilter, (event) => updateDBFromEpochEndedEvent(event, startBlock)
    )

    provider.on(
        epochKeyProofFilter, (event) => updateDBFromEpochKeyProofEvent(event, startBlock)
    )
    provider.on(
        reputationProofFilter, (event) => updateDBFromReputationProofEvent(event, startBlock)
    )
    provider.on(
        signUpProofFilter, (event) => updateDBFromUserSignedUpProofEvent(event, startBlock)
    )
    provider.on(
        startTransitionFilter, (event) => updateDBFromStartUSTProofEvent(event, startBlock)
    )
    provider.on(
        processAttestationsFilter, (event) => updateDBFromProcessAttestationProofEvent(event, startBlock)
    )
    provider.on(
        userStateTransitionFilter, (event) => updateDBFromUSTProofEvent(event, startBlock)
    )

    provider.on(
        userSignUpFilter, (event) => updateDBFromUserSignUpEvent(event, startBlock)
    )
    provider.on(
        postFilter, (event) => updateDBFromPostSubmittedEvent(event, startBlock)
    )
    provider.on(
        commentFilter, (event) => updateDBFromCommentSubmittedEvent(event, startBlock)
    )
    provider.on(
        voteFilter, (event) => updateDBFromVoteSubmittedEvent(event, startBlock)
    )
    provider.on(
        airdropFilter, (event) => updateDBFromAirdropSubmittedEvent(event, startBlock)
    )
}
