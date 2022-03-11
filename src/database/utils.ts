import { Attestation, circuitUserStateTreeDepth, circuitGlobalStateTreeDepth, computeEmptyUserStateRoot, computeInitUserStateRoot, genUnirepStateFromContract, } from '@unirep/unirep'
import { ethers } from 'ethers'
import { getUnirepContract, Event, AttestationEvent, EpochKeyProof, ReputationProof, SignUpProof, UserTransitionProof } from '@unirep/contracts';
import { hashLeftRight, IncrementalQuinTree, stringifyBigInts, unstringifyBigInts } from '@unirep/crypto'
import { DEFAULT_COMMENT_KARMA, DEFAULT_ETH_PROVIDER, DEFAULT_POST_KARMA, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI, UNIREP_SOCIAL_ABI, ActionType, DEFAULT_AIRDROPPED_KARMA, titlePrefix, titlePostfix, DEFAULT_QUERY_DEPTH, QUERY_DELAY_TIME, } from '../constants'
import Attestations, { IAttestation } from './models/attestation'
import GSTLeaves, { IGSTLeaf } from './models/GSTLeaf'
import GSTRoots from './models/GSTRoots'
import Epoch from './models/epochTreeLeaf'
import Nullifier, { INullifier } from './models/nullifiers'
import Record, { IRecord } from './models/record';
import EpkRecord from './models/epkRecord';

const getCurrentEpoch = async (): Promise<number> => {
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER);
    const epoch = await unirepContract.currentEpoch()
    return Number(epoch);
}

const GSTRootExists = async (epoch: number, GSTRoot: string | BigInt): Promise<boolean> => {
    const currentEpoch = await getCurrentEpoch();
    if (epoch > currentEpoch) {
        return false
    }
    const root = await GSTRoots.findOne({
        epoch: epoch,
        GSTRoots: {$eq: GSTRoot.toString()}
    })
    if(root !== null) return true
    return false
}

const epochTreeRootExists = async (epoch: number, epochTreeRoot: string | BigInt): Promise<boolean> => {
    const currentEpoch = await getCurrentEpoch();
    if (epoch >= currentEpoch) {
        return false
    }
    const root = await Epoch.findOne({
        epoch: epoch,
        epochTreeRoot: epochTreeRoot.toString()
    })
    if(root !== null) return true
    else {
        console.log('Epoch tree is not stored successfully');
        const findEpoch = await Epoch.findOne({
            epoch: epoch,
        })
        if (findEpoch === null) {
            // const unirepState = await genUnirepStateFromContract(
            //     DEFAULT_ETH_PROVIDER,
            //     UNIREP
            // )
            // const epochTree = await unirepState.genEpochTree(epoch)
            // const newEpochTreeLeaves = new Epoch({
            //     epoch: epoch,
            //     epochRoot: epochTree.getRootHash().toString(),
            // })
            //
            // try {
            //     const res = await newEpochTreeLeaves.save()
            //     console.log(res)
            // } catch(e) {
            //     console.log(e)
            // }
            // if (epochTreeRoot.toString() === newEpochTreeLeaves.epochRoot) return true
        }
    }
    return false
}

const writeRecord = async (to: string, from: string, posRep: number, negRep: number, epoch: number, action: string, txHash: string, data: string) => {
    // If the record is saved before, then ignore the transaction hash
    const record = await Record.findOne({ transactionHash: txHash })
    if(record !== null) return

    const newRecord: IRecord = new Record({
        to,
        from,
        upvote: posRep,
        downvote: negRep,
        epoch,
        action,
        data,
        transactionHash: txHash,
    });

    if (action === ActionType.Vote) {
        await EpkRecord.findOneAndUpdate(
            {epk: from, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: posRep + negRep} },
            { "new": true, "upsert": true },
        );

        await EpkRecord.findOneAndUpdate(
            {epk: to, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep, negRep} },
            { "new": true, "upsert": true },
        );
    } else {
        await EpkRecord.findOneAndUpdate(
            {epk: from, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: negRep} },
            { "new": true, "upsert": true },
          );
    }

    await newRecord.save();
}


export {
    GSTRootExists,
    epochTreeRootExists,
    writeRecord,
}
