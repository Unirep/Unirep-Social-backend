import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import randomstring from 'randomstring';

import ErrorHandler from './ErrorHandler';
import MasterRouter from './routers/MasterRouter';

import EpochController from './controllers/EpochController';
import { DEFAULT_ETH_PROVIDER, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI, UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, MONGODB } from './constants';
import { initDB, updateDBFromAirdropSubmittedEvent, updateDBFromAttestationEvent, updateDBFromCommentSubmittedEvent, updateDBFromEpochEndedEvent, updateDBFromEpochKeyProofEvent, updateDBFromPostSubmittedEvent, updateDBFromProcessAttestationProofEvent, updateDBFromReputationProofEvent, updateDBFromStartUSTProofEvent, updateDBFromUnirepUserSignUpEvent, updateDBFromUserSignedUpProofEvent, updateDBFromUserSignUpEvent, updateDBFromUSTEvent, updateDBFromUSTProofEvent, updateDBFromVoteSubmittedEvent } from './database/utils';

// load the environment variables from the .env file
dotenv.config({
    path: '.env'
});

/**
 * Express server application class.
 * @description Will later contain the routing system.
 */
class Server {
    public app = express();
    public router = MasterRouter;
}

// initialize server app
const server = new Server();
server.app.use(cors());
server.app.use(express.json());

// make server app handle any route starting with '/api'
server.app.use('/api', server.router);

// make server app handle any error
server.app.use((err: ErrorHandler, req: Request, res: Response, next: NextFunction) => {
    res.status(err.statusCode || 500).json({
        status: 'error',
        statusCode: err.statusCode,
        message: err.message
    });
});

// global variables: actually should be stored in db
global.epochPeriod = 24 * 60 * 60 * 1000 + 30000;
// global.epochPeriod = 10 * 60 * 1000;

global.nextEpochTransition = Date.now() + global.epochPeriod; // delay 30 seconds
console.log(global.nextEpochTransition);

global.adminSessionCode = randomstring.generate(20);

const delayEpochTransition = async() => {
    console.log('delayed for 3 minutes');
    const delayedPeriod = 3 * 60 * 1000;
    global.nextEpochTransition = Date.now() + delayedPeriod;
    setTimeout(doEpochTransition, delayedPeriod);
}

const doEpochTransition = async () => {
    console.log('do epoch transition');
    const _controller = EpochController;
    try {
        global.adminSessionCode = randomstring.generate(20);
        const status = await _controller.epochTransition();
        if(status)
            setTimeout(doEpochTransition, global.epochPeriod);
        else
            await delayEpochTransition();
    } catch (e) {
        console.error(e);
        await delayEpochTransition();
    }
}

setTimeout(doEpochTransition, global.epochPeriod);

// make server listen on some port
((port = process.env.APP_PORT || 5000) => {
    server.app.listen(port, () => console.log(`> Listening on port ${port}`));
})();

var mongoDB = MONGODB + '/unirep_social';
mongoose.connect(mongoDB);
// Get Mongoose to use the global promise library
mongoose.Promise = global.Promise;
//Get the default connection
var db = mongoose.connection;

//Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

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

var startBlock = DEFAULT_START_BLOCK
initDB(unirepContract, unirepSocialContract).then((res) => {
    startBlock = res 
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
})
