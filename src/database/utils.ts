import { Attestation, circuitEpochTreeDepth, circuitUserStateTreeDepth, circuitGlobalStateTreeDepth, computeEmptyUserStateRoot, genNewSMT, SMT_ONE_LEAF, verifyUSTEvents, verifyEpochKeyProofEvent, verifyReputationProofEvent, verifySignUpProofEvent, computeInitUserStateRoot, } from '@unirep/unirep'
import { ethers } from 'ethers'
import { getUnirepContract, Event, AttestationEvent } from '@unirep/contracts';
import { hashLeftRight, IncrementalQuinTree, add0x } from '@unirep/crypto'
import { DEFAULT_COMMENT_KARMA, DEFAULT_ETH_PROVIDER, DEFAULT_POST_KARMA, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI, UNIREP_SOCIAL_ABI, ActionType, DEFAULT_AIRDROPPED_KARMA, titlePrefix, titlePostfix } from '../constants'
import Attestations, { IAttestation } from './models/attestation'
import GSTLeaves, { IGSTLeaf } from './models/GSTLeaf'
import GSTRoots from './models/GSTRoots'
import Epoch from './models/epoch'
import EpochTreeLeaves, { IEpochTreeLeaf } from './models/epochTreeLeaf'
import Nullifier, { INullifier } from './models/nullifiers'
import Record, { IRecord } from './models/record';
import Post, { IPost } from "./models/post";
import Comment, { IComment } from "./models/comment";
import EpkRecord from './models/epkRecord';
import userSignUp, { IUserSignUp } from './models/userSignUp';
import Proof from './models/proof'; 

const getGSTLeaves = async (epoch: number): Promise<IGSTLeaf[]> => {
    const leaves = await GSTLeaves.findOne({epoch: epoch})
    return leaves? leaves.GSTLeaves : []
}

const getEpochTreeLeaves = async (epoch: number): Promise<IEpochTreeLeaf[]> => {
    const leaves = await EpochTreeLeaves.findOne({epoch: epoch})
    return leaves? leaves.epochTreeLeaves : []
}

const GSTRootExists = async (epoch: number, GSTRoot: string | BigInt): Promise<boolean> => {
    const root = await GSTRoots.findOne({epoch: epoch, GSTRoots: {$eq: GSTRoot.toString()}})
    if(root != undefined) return true
    return false
}

const epochTreeRootExists = async (epoch: number, epochTreeRoot: string | BigInt): Promise<boolean> => {
    const root = await EpochTreeLeaves.findOne({epoch: epoch, epochTreeRoot: epochTreeRoot.toString()})
    if(root != undefined) return true
    return false
}

const nullifierExists = async (nullifier: string): Promise<boolean> => {
    const n = await Nullifier.findOne({
        nullifier: nullifier
    })
    if (n !== null) return true
    return false
}

const duplicatedNullifierExists = async (nullifier: string, txHash: string, epoch?: number): Promise<boolean> => {
    // post and attestation submitted both emit nullifiers, but we cannot make sure which one comes first
    // use txHash to differenciate if the nullifier submitted is the same
    // If the same nullifier appears in different txHash, then the nullifier is invalid
   
    const n = await Nullifier.findOne({
        $and: [
            {
                $or: [
                    {epoch: epoch, nullifier: nullifier},
                    {nullifier: nullifier},
                ]
            },
            {
                transactionHash: {
                    $nin: [ txHash ]
                }
            }
        ]
    })
    if (n !== null) return true
    
    return false
}

const checkAndSaveNullifiers = async (
    _epoch: number, 
    _nullifiers: string[],
    _txHash: string
): Promise<boolean> => {
    // check nullifiers
    for (let nullifier of _nullifiers) {
        if (BigInt(nullifier) === BigInt(0)) continue
        // nullifier with the same transaction hash means it has been recorded before
        const duplicatedNullifier = await duplicatedNullifierExists(nullifier, _txHash)
        if(duplicatedNullifier) {
            console.log(nullifier, 'exists before')
            return false
        }
    }
    // save nullifiers
    for(let _nullifier of _nullifiers){
        if(BigInt(_nullifier) !== BigInt(0)){
            const nullifier: INullifier = new Nullifier({
                epoch: _epoch,
                nullifier: _nullifier,
                transactionHash: _txHash,
            })
            try {
                await nullifier.save()
            } catch (error) {
                return true
            }
        }    
    }
    return true
}

const insertAttestation = async (epoch: number, epochKey: string, attestIndex: number, newAttestation: IAttestation) => {
    try {
        await Attestations.findOneAndUpdate(
            {
                $and: [
                    {
                        epoch: epoch
                    },
                    {
                        epochKey: epochKey
                    },
                    {
                        "attestations.index": {
                            $nin: [ attestIndex ]
                        }
                    }
                ]
            },
            {
                $push: {
                    attestations: newAttestation
                }
            },
            {
                upsert: true
            }
        )
    } catch (error) {
        await Attestations.findOneAndUpdate(
            {
                $and: [
                    {
                        epoch: epoch
                    },
                    {
                        epochKey: epochKey
                    },
                    {
                        "attestations.index": {
                            $nin: [ attestIndex ]
                        }
                    }
                ]
            },
            {
                $push: {
                    attestations: newAttestation
                }
            }
        )
    }
}

const insertGSTLeaf = async (epoch: number, newLeaf: IGSTLeaf) => {
    try {
        await GSTLeaves.findOneAndUpdate({
            $and: [
                {
                    epoch: epoch
                },
                {
                    "GSTLeaves.transactionHash": {
                        $nin: [
                            newLeaf.transactionHash
                        ]
                    }
                },
                {
                    "GSTLeaves.hashedLeaf": {
                        $nin: [
                            newLeaf.hashedLeaf
                        ]
                    }
                }
            ]
        },{
            $push: {
                GSTLeaves: newLeaf
            }
        },{
            upsert: true
        })
    } catch (error) {
        await GSTLeaves.findOneAndUpdate({
            $and: [
                {
                    epoch: epoch
                },
                {
                    "GSTLeaves.transactionHash": {
                        $nin: [
                            newLeaf.transactionHash
                        ]
                    }
                },
                {
                    "GSTLeaves.hashedLeaf": {
                        $nin: [
                            newLeaf.hashedLeaf
                        ]
                    }
                }
            ]
        },{
            $push: {
                GSTLeaves: newLeaf
            }
        })
    }
}

const insertGSTRoot = async (epoch: number, GSTRoot: string) => {
    try {
        await GSTRoots.findOneAndUpdate({
            $and: [
                {
                    epoch: epoch
                },
                {
                    GSTRoots: {
                        $nin: [
                            GSTRoot
                        ]
                    }
                }
            ]
        },{
            $push: {
                GSTRoots: GSTRoot
            }
        }, {
            upsert: true
        })
    } catch (error) {
        await GSTRoots.findOneAndUpdate({
            $and: [
                {
                    epoch: epoch
                },
                {
                    GSTRoots: {
                        $nin: [
                            GSTRoot
                        ]
                    }
                }
            ]
        },{
            $push: {
                GSTRoots: GSTRoot
            }
        })
    }
}

const verifyUSTProofByIndex = async(proofIndex: number | ethers.BigNumber): Promise<ethers.Event | void> => {
    const provider = new ethers.providers.JsonRpcProvider(DEFAULT_ETH_PROVIDER)
    const unirepContract = getUnirepContract(UNIREP, provider)

    // 2. verify user state transition proof
    const transitionFilter = unirepContract.filters.IndexedUserStateTransitionProof(proofIndex)
    const transitionEvents = await unirepContract.queryFilter(transitionFilter)
    if(transitionEvents.length == 0) return
    // proof index is supposed to be unique, therefore it should be only one event found
    const transitionArgs = transitionEvents[0]?.args?._proof
    
    const _proofIndexes = transitionEvents[0]?.args?._proofIndexRecords.map(n => Number(n))
    // Proof index 0 should be the start transition proof
    const startTransitionFilter = unirepContract.filters.IndexedStartedTransitionProof(
        _proofIndexes[0], 
        transitionArgs.blindedUserStates[0], 
        transitionArgs.fromGlobalStateTree
    )
    const startTransitionEvents = await unirepContract.queryFilter(startTransitionFilter)
    if(startTransitionEvents.length == 0) return

    // process attestations proofs
    const processAttestationsEvents: ethers.Event[] = []
    for (let i = 1; i < _proofIndexes.length; i++) {
        const processAttestationsFilter = unirepContract.filters.IndexedProcessedAttestationsProof(_proofIndexes[i])
        const events = await unirepContract.queryFilter(processAttestationsFilter)
        processAttestationsEvents.push(events[0])
    }

    const isValid = await verifyUSTEvents(
        transitionEvents[0], 
        startTransitionEvents[0], 
        processAttestationsEvents
    )
    if (!isValid) return

    return transitionEvents[0]
}

const verifyAttestationProofsByIndex = async (proofIndex: number | ethers.BigNumber): Promise<any> => {
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = getUnirepContract(UNIREP, provider)

    const epochKeyProofFilter = unirepContract.filters.IndexedEpochKeyProof(proofIndex)
    const epochKeyProofEvent = await unirepContract.queryFilter(epochKeyProofFilter)
    const repProofFilter = unirepContract.filters.IndexedReputationProof(proofIndex)
    const repProofEvent = await unirepContract.queryFilter(repProofFilter)
    const signUpProofFilter = unirepContract.filters.IndexedUserSignedUpProof(proofIndex)
    const signUpProofEvent = await unirepContract.queryFilter(signUpProofFilter)
    let isProofValid = false
    let event

    if (epochKeyProofEvent.length == 1){
        event = epochKeyProofEvent[0]
        isProofValid = await verifyEpochKeyProofEvent(event)
    } else if (repProofEvent.length == 1){
        event = repProofEvent[0]
        isProofValid = await verifyReputationProofEvent(event)
    } else if (signUpProofEvent.length == 1){
        event = signUpProofEvent[0]
        isProofValid = await verifySignUpProofEvent(event)
    } else {
        console.log(`Proof index ${Number(proofIndex)} is not found`)
        return { isProofValid, args: [] }
    }
    if(!isProofValid) {
        console.log('Proof index ', Number(proofIndex), ' is invalid')
        return {isProofValid: isProofValid, args: event?.args}
    }
    
    const args = event?.args
    const epoch = Number(args?._epoch)
    const GSTRoot = BigInt(args?._proof?.globalStateTree).toString()
    const isGSTExisted = await GSTRootExists(epoch, GSTRoot)
    if(!isGSTExisted) {
        isProofValid = false
        console.log('Global state tree root mismatches')
    }
    return {isProofValid, args}
}

const updateGSTLeaf = async (
    _newLeaf: IGSTLeaf,
    _epoch: number,
) => {
    // compute GST root and save GST root
    const emptyUserStateRoot = computeEmptyUserStateRoot(circuitUserStateTreeDepth)
    const defaultGSTLeaf = hashLeftRight(BigInt(0), emptyUserStateRoot)
    const globalStateTree = new IncrementalQuinTree(
        circuitGlobalStateTreeDepth,
        defaultGSTLeaf,
        2,
    )
    
    // update GST leaf document
    await insertGSTLeaf(_epoch, _newLeaf)

    const treeLeaves = await GSTLeaves.findOne({
        epoch: _epoch
    })
    for (let leaf of treeLeaves?.get('GSTLeaves.hashedLeaf')) {
        globalStateTree.insert(leaf)
        // update GST root document
        await insertGSTRoot(_epoch, globalStateTree.root.toString())
    }
}

const saveAttestationResult = async (epoch: number, epochKey: string, attestIndex: number, valid: boolean,) => {
    await Attestations.findOneAndUpdate({
        epoch: epoch,
        epochKey: epochKey,
        attestations: { $elemMatch: {index: attestIndex} }
    }, {
        "attestations.$.valid": valid
    })
}

/*
* When a UserSignedUp event comes
* update the database
* @param event UserSignedUp event
*/
const updateDBFromUserSignUpEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const _epoch = Number(event.topics[1])
    const _commitment = BigInt(event.topics[2]).toString()
    const query = {
        transactionHash: event.transactionHash,
        commitment: _commitment,
        epoch: _epoch
    }
    const findUser = await userSignUp.findOne(query)
    if (findUser === null) {
        const newUser: IUserSignUp = new userSignUp(query)
        newUser.set({ "new": true, "upsert": false})
        await newUser.save()
        console.log('saved user: ', _commitment)
    }
}

/*
* When a PostSubmitted event comes
* update the database
* @param event PostSubmitted event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromPostSubmittedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const postId = event.transactionHash
    const findPost = await Post.findOne({ transactionHash: postId })
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = getUnirepContract(UNIREP, provider)

    const iface = new ethers.utils.Interface(UNIREP_SOCIAL_ABI)
    const decodedData = iface.decodeEventLog("PostSubmitted",event.data)
    const reputationProof = decodedData?.proofRelated
    const proofNullifier = await unirepContract.hashReputationProof(reputationProof)
    const proofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

    const _transactionHash = event.transactionHash
    const _epoch = Number(event?.topics[1])
    const _epochKey = BigInt(event.topics[2]).toString(16)
    const _minRep = Number(decodedData?.proofRelated.minRep._hex)

    const findValidProof = await Proof.findOne({index: proofIndex, epoch: _epoch})
    if (findValidProof?.valid === false) {
        console.log(`proof index ${proofIndex} is invalid`)
        return
    } else if (findValidProof === null) {
        const {isProofValid} = await verifyAttestationProofsByIndex(proofIndex)
        if (isProofValid === false) {
            console.log(`proof index ${proofIndex} is invalid`)
            return
        }
    }
    
    const repNullifiers = decodedData?.proofRelated?.repNullifiers.map(n => BigInt(n).toString())
    const success = await checkAndSaveNullifiers(_epoch, repNullifiers, event.transactionHash)
    if (!success) {
        console.log(`duplicated nullifier`)
        return
    }
    
    if(findPost){
        findPost?.set('status', 1, { "new": true, "upsert": false})
        findPost?.set('transactionHash', _transactionHash, { "new": true, "upsert": false})
        findPost?.set('proofIndex', proofIndex, { "new": true, "upsert": false})
        await findPost?.save()
    } else {
        let content: string = '';
        let title: string = '';
        if (decodedData !== null) {
            let i: number = decodedData._postContent.indexOf(titlePrefix)
            if (i === -1) {
                content = decodedData._postContent;
            } else {
                i = i + titlePrefix.length;
                let j: number = decodedData._postContent.indexOf(titlePostfix, i + 1)
                if (j === -1) {
                    content = decodedData._postContent;
                } else {
                    title = decodedData._postContent.substring(i, j);
                    content = decodedData._postContent.substring(j + titlePostfix.length);
                }
            }
        }
        const newpost: IPost = new Post({
            transactionHash: _transactionHash,
            title,
            content,
            epochKey: _epochKey,
            epoch: _epoch,
            proofIndex: proofIndex,
            proveMinRep: _minRep !== null ? true : false,
            minRep: _minRep,
            posRep: 0,
            negRep: 0,
            comments: [],
            status: 1
        });
        newpost.set({ "new": true, "upsert": false})
        await newpost.save()
    }

    await writeRecord(_epochKey, _epochKey, 0, DEFAULT_POST_KARMA, _epoch, ActionType.Post, _transactionHash, _transactionHash);
}

/*
* When a CommentSubmitted event comes
* update the database
* @param event CommentSubmitted event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromCommentSubmittedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_SOCIAL_ABI)
    const decodedData = iface.decodeEventLog("CommentSubmitted",event.data)
    const _transactionHash = event.transactionHash
    const commentId = event.transactionHash
    const postId = event.topics[2]
    const _epoch = Number(event.topics[1])
    const _epochKey = BigInt(event.topics[3]).toString(16)
    const _minRep = Number(decodedData?.proofRelated.minRep._hex)
    const findComment = await Comment.findOne({ transactionHash: commentId })
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = getUnirepContract(UNIREP, provider)
        
    const reputationProof = decodedData?.proofRelated
    const proofNullifier = await unirepContract.hashReputationProof(reputationProof)
    const proofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

    const findValidProof = await Proof.findOne({index: proofIndex, epoch: _epoch})
    if (findValidProof?.valid === false) {
        console.log(`proof index ${proofIndex} is invalid`)
        return
    } else if (findValidProof === null) {
        const {isProofValid} = await verifyAttestationProofsByIndex(proofIndex)
        if (isProofValid === false) {
            console.log(`proof index ${proofIndex} is invalid`)
            return
        }
    }

    const repNullifiers = decodedData?.proofRelated?.repNullifiers.map(n => BigInt(n).toString())
    const success = await checkAndSaveNullifiers(_epoch, repNullifiers, event.transactionHash)
    if (!success) {
        console.log(`duplicated nullifier`)
        return
    }
    
    if(findComment) {
        findComment?.set('status', 1, { "new": true, "upsert": false})
        findComment?.set('transactionHash', _transactionHash, { "new": true, "upsert": false})
        findComment?.set('proofIndex', proofIndex, { "new": true, "upsert": false})
        await findComment?.save()
    } else {
        const newComment: IComment = new Comment({
            transactionHash: _transactionHash,
            postId,
            content: decodedData?._commentContent, // TODO: hashedContent
            epochKey: _epochKey,
            proofIndex: proofIndex,
            epoch: _epoch,
            proveMinRep: _minRep !== 0 ? true : false,
            minRep: _minRep,
            posRep: 0,
            negRep: 0,
            status: 1
        });
        newComment.set({ "new": true, "upsert": false})

        await newComment.save()
    }

    const findPost = await Post.findOne({ transactionHash: postId })
    if(findPost === undefined) {
        console.log('cannot find post ID', postId)
        return
    }
    const commentExists = await Post.findOne({ comments: {$in: [commentId]} })
    if(commentExists === null) {
        findPost?.comments.push(commentId)
        findPost?.set({ "new": true, "upsert": true })
        await findPost?.save((err) => console.log('update comments of post error: ' + err))
    }

    await writeRecord(_epochKey, _epochKey, 0, DEFAULT_COMMENT_KARMA, _epoch, ActionType.Comment, _transactionHash, postId + '_' + _transactionHash);
}

/*
* When a VoteSubmitted event comes
* update the database
* @param event VoteSubmitted event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromVoteSubmittedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_SOCIAL_ABI)
    const decodedData = iface.decodeEventLog("VoteSubmitted",event.data)
    const _transactionHash = event.transactionHash
    const _epoch = Number(event.topics[1])
    const _fromEpochKey = BigInt(event.topics[2]).toString(16)
    const _toEpochKey = BigInt(event.topics[3]).toString(16)
    const _toEpochKeyProofIndex = Number(decodedData?.toEpochKeyProofIndex._hex)
    
    const _posRep = Number(decodedData?.upvoteValue._hex)
    const _negRep = Number(decodedData?.downvoteValue._hex)
    
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = getUnirepContract(UNIREP, provider)
        
    const reputationProof = decodedData?.proofRelated
    const proofNullifier = await unirepContract.hashReputationProof(reputationProof)
    const fromProofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

    const findValidProof = await Proof.findOne({index: _toEpochKeyProofIndex, epoch: _epoch})
    if (findValidProof?.valid === false) {
        console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
        return
    } else if (findValidProof === null) {
        const {isProofValid} = await verifyAttestationProofsByIndex(_toEpochKeyProofIndex)
        if (isProofValid === false) {
            console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
            return
        }
    }

    const fromValidProof = await Proof.findOne({
        epoch: _epoch, 
        index: fromProofIndex,
    })
    if (fromValidProof?.valid === false) {
        console.log(`proof index ${fromProofIndex} is invalid`)
        return
    } else if (fromProofIndex === null) {
        const {isProofValid} = await verifyAttestationProofsByIndex(fromProofIndex)
        if (isProofValid === false) {
            console.log(`proof index ${fromProofIndex} is invalid`)
            return
        }
    }
    
    const repNullifiers = decodedData?.proofRelated?.repNullifiers.map(n => BigInt(n).toString())
    const success = await checkAndSaveNullifiers(_epoch, repNullifiers, event.transactionHash)
    if (!success) {
        console.log(`duplicated nullifier`)
        return
    }

    await writeRecord(_toEpochKey, _fromEpochKey, _posRep, _negRep, _epoch, ActionType.Vote, _transactionHash, '');
}

/*
* When a AirdropSubmitted event comes
* update the database
* @param event AirdropSubmitted event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromAirdropSubmittedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_SOCIAL_ABI)
    const decodedData = iface.decodeEventLog("AirdropSubmitted",event.data)
    const _transactionHash = event.transactionHash
    const _epoch = Number(event.topics[1])
    const _epochKey = BigInt(event.topics[2]).toString(16)
    const signUpProof = decodedData?.proofRelated

    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = getUnirepContract(UNIREP, provider)
    
    const proofNullifier = await unirepContract.hashSignUpProof(signUpProof)
    const proofIndex = await unirepContract.getProofIndex(proofNullifier)

    const {isProofValid} = await verifyAttestationProofsByIndex(proofIndex)
    if (isProofValid === false) return

    const findRecord = await Record.findOne({transactionHash: _transactionHash})
    if(findRecord === null) {
        const newRecord: IRecord = new Record({
            to: _epochKey,
            from: 'UnirepSocial',
            upvote: DEFAULT_AIRDROPPED_KARMA,
            downvote: 0,
            epoch: _epoch,
            action: 'UST',
            data: '0',
            transactionHash: event.transactionHash,
        });
        await newRecord.save((err) => console.log('save airdrop record error: ' + err));
    }
}

/*
* When a UserSignedUp event comes
* update the database
* @param event UserSignedUp event
* @param startBlock The event should be processed if the block number is greater than the start block
*/

const updateDBFromUnirepUserSignUpEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const decodedData = iface.decodeEventLog("UserSignedUp",event.data)

    const transactionHash = event.transactionHash
    const epoch = Number(event?.topics[1])
    const idCommitment = BigInt(event?.topics[2])
    const attesterId = Number(decodedData?._attesterId)
    const airdrop = Number(decodedData?._airdropAmount)

    const USTRoot = await computeInitUserStateRoot(
        circuitUserStateTreeDepth,
        attesterId,
        airdrop
    )
    const GSTLeaf = hashLeftRight(idCommitment, USTRoot)

    // save the new leaf
    const newLeaf: IGSTLeaf = {
        transactionHash: transactionHash,
        hashedLeaf: GSTLeaf.toString()
    }
    await updateGSTLeaf(newLeaf, epoch)
}


/*
* When a UserStateTransitioned event comes
* update the database
* @param event UserStateTransitioned event
* @param startBlock The event should be processed if the block number is greater than the start block
*/

const updateDBFromUSTEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const decodedData = iface.decodeEventLog("UserStateTransitioned",event.data)

    const _transactionHash = event.transactionHash
    const _epoch = Number(event?.topics[1])
    const _hashedLeaf = BigInt(event?.topics[2]).toString()

    const proofIndex = decodedData?._proofIndex
    const results = await verifyUSTProofByIndex(proofIndex)
    if (results == undefined) {
        console.log('Proof is invalid, transaction hash', _transactionHash)
        return
    }

    // save epoch key nullifiers
    if (results?.event == "UserStateTransitionProof") {
        // check if GST root, epoch tree root exists
        const proofArgs = results?.args?._proof
        const fromEpoch = Number(proofArgs?.transitionFromEpoch)
        const GSTRoot = proofArgs?.fromGlobalStateTree
        const epochTreeRoot = proofArgs?.fromEpochTree
        const epkNullifier = proofArgs?.epkNullifiers.map(n => BigInt(n).toString())
        const isGSTExisted = await GSTRootExists(fromEpoch, GSTRoot)
        const isEpochTreeExisted = await epochTreeRootExists(fromEpoch, epochTreeRoot)
        if(!isGSTExisted) {
            console.log('Global state tree root mismatches')
            return
        }
        if(!isEpochTreeExisted) {
            console.log('Epoch tree root mismatches')
            return
        }

        // check and save nullifiers
        const success = await checkAndSaveNullifiers(_epoch, epkNullifier, event.transactionHash)
        if (!success) {
            console.log(`duplicated nullifier`)
            return
        }
    }

    // save the new leaf
    const newLeaf: IGSTLeaf = {
        transactionHash: _transactionHash,
        hashedLeaf: _hashedLeaf
    }
    await updateGSTLeaf(newLeaf, _epoch)
}

/*
* When an AttestationSubmitted event comes
* update the database
* @param event AttestationSubmitted event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromAttestationEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _epoch = Number(event.topics[1])
    const _epochKey = BigInt(event.topics[2])
    const _attester = event.topics[3]
    const decodedData = iface.decodeEventLog("AttestationSubmitted",event.data)
    const toProofIndex = Number(decodedData?.toProofIndex)
    const fromProofIndex = Number(decodedData?.fromProofIndex)
    const attestIndex = Number(decodedData?.attestIndex)
    const findAttestation = await Attestations.findOne({
        "attestations.index": {
            $in: [ attestIndex ]
        }
    })
    if (findAttestation !== null) return

    const attestation = new Attestation(
        BigInt(decodedData?._attestation?.attesterId),
        BigInt(decodedData?._attestation?.posRep),
        BigInt(decodedData?._attestation?.negRep),
        BigInt(decodedData?._attestation?.graffiti?._hex),
        BigInt(decodedData?._attestation?.signUp)
    )
    const newAttestation: IAttestation = {
        index: attestIndex,
        transactionHash: event.transactionHash,
        attester: _attester,
        proofIndex: toProofIndex,
        attesterId: Number(decodedData?._attestation?.attesterId),
        posRep: Number(decodedData?._attestation?.posRep),
        negRep: Number(decodedData?._attestation?.negRep),
        graffiti: decodedData?._attestation?.graffiti?._hex,
        signUp: Boolean(Number(decodedData?._attestation?.signUp)),
        hash: attestation.hash().toString(),
    }
    await insertAttestation(_epoch, _epochKey.toString(16), attestIndex, newAttestation)

    const validProof = await Proof.findOne({
        epoch: _epoch, 
        index: toProofIndex,
    })
    if (validProof?.valid === false) {
        await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
        return
    }
    else if (validProof === null) {
        const { isProofValid, args } = await verifyAttestationProofsByIndex(toProofIndex)
        const newProof = new Proof({
            index: toProofIndex,
            epoch: _epoch,
            args: JSON.stringify(args?.map(n => n.toString())),
            transactionHash: event.transactionHash
        })
        if (isProofValid === false) {
            console.log(`receiver epoch key ${_epochKey} of proof index ${toProofIndex} is invalid`)
            newProof.valid = false
            await newProof.save()
            await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
            return
        }
        if (Number(args?._proof?.epoch) !== _epoch) {
            console.log(`receiver epoch key is not in the current epoch`)
            return
        }
        if (BigInt(_epochKey) !== BigInt(args?._proof?.epochKey)) { 
            console.log(`epoch key mismath in the proof index ${toProofIndex}`)
            return
        }
        if (decodedData?._event === AttestationEvent.SpendReputation) {
            // check nullifiers
            const repNullifiers = args?._proof?.repNullifiers.map(n => BigInt(n).toString())
            const success = await checkAndSaveNullifiers(_epoch, repNullifiers, event.transactionHash)
            if (!success) {
                console.log(`duplicated nullifiers`)
                newProof.valid = false
                await newProof.save()
                await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
                return
            }
        } 
        newProof.valid = true
        await newProof.save()
    }
    
    if (fromProofIndex) {
        const fromValidProof = await Proof.findOne({
            epoch: _epoch, 
            index: fromProofIndex,
        })
        if (fromValidProof?.valid === false) {
            await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
            return
        }
        else if (fromValidProof?.spent) {
            await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
            return
        }
        fromValidProof?.set('spent', true)
        await fromValidProof?.save()
    }
    await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, true)
}

/*
* When an EpochEnded event comes
* update the database
* @param event EpochEnded event
* @param startBlock The event should be processed if the block number is greater than the start block
*/
const updateDBFromEpochEndedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    // update Unirep state
    const epoch = Number(event?.topics[1])
    const findEpochTree = await EpochTreeLeaves.findOne({epoch: epoch})
    if (findEpochTree !== null) return
    const findEpoch = await Epoch.findOneAndUpdate({}, {currentEpoch: epoch + 1})

    // Get epoch tree leaves of the ending epoch
    let attestations = await Attestations.find({epoch: epoch})
    const epochTree = await genNewSMT(circuitEpochTreeDepth, SMT_ONE_LEAF)
    const epochTreeLeaves: IEpochTreeLeaf[] = []

    // seal all epoch keys in current epoch
    for (let attestation of attestations) {
        let currentHashChain: BigInt = BigInt(0)
        const attestationList = attestation.get('attestations')
        for (let i = 0; i < attestationList.length; i++) {
            if (attestationList[i].valid) {
                currentHashChain = hashLeftRight(
                    BigInt(attestationList[i].hash),
                    currentHashChain
                )
            }
        }
        const sealedHashchain = hashLeftRight(
            BigInt(1),
            currentHashChain
        )
        const epochTreeLeaf: IEpochTreeLeaf = {
            epochKey: attestation?.get('epochKey'),
            hashchainResult: sealedHashchain.toString()
        }
        epochTreeLeaves.push(epochTreeLeaf)
    }

    // Add to epoch key hash chain map
    for (let leaf of epochTreeLeaves) {
        await epochTree.update(BigInt(add0x(leaf.epochKey)), BigInt(leaf.hashchainResult))
    }

    const newEpochTreeLeaves = new EpochTreeLeaves({
        epoch: epoch,
        epochTreeLeaves: epochTreeLeaves,
        epochTreeRoot: epochTree.getRootHash(),
    })

    await newEpochTreeLeaves.save()
    global.nextEpochTransition = Date.now() + global.epochPeriod + 10000; // delay 10 seconds
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
        EpkRecord.findOneAndUpdate(
            {epk: from, epoch}, 
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: posRep + negRep} },
            { "new": true, "upsert": true }, 
            (err, record) => {
                // console.log('update voter record is: ' + record);
                if (err !== null) {
                    console.log('update voter epk record error: ' + err);
                }
        });

        EpkRecord.findOneAndUpdate(
            {epk: to, epoch}, 
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep, negRep} },
            { "new": true, "upsert": true }, 
            (err, record) => {
                // console.log('update receiver record is: ' + record);
                if (err !== null) {
                    console.log('update receiver epk record error: ' + err);
                }
        });
    } else {
        EpkRecord.findOneAndUpdate(
            {epk: from, epoch}, 
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: negRep} },
            { "new": true, "upsert": true }, 
            (err, record) => {
                // console.log('update action record is: ' + record);
                if (err !== null) {
                    console.log('update action epk record error: ' + err);
                }
            });
    }

    await newRecord.save();
}

const initDB = async (
    unirepContract: ethers.Contract,
    unirepSocialContract: ethers.Contract
) => {
    const userSignedUpFilter = unirepContract.filters.UserSignedUp()
    const userSignedUpEvents =  await unirepContract.queryFilter(userSignedUpFilter)
    const userStateTransitionedFilter = unirepContract.filters.UserStateTransitioned()
    const userStateTransitionedEvents = await unirepContract.queryFilter(userStateTransitionedFilter)
    const attestationSubmittedFilter = unirepContract.filters.AttestationSubmitted()
    const attestationSubmittedEvents =  await unirepContract.queryFilter(attestationSubmittedFilter)
    const epochEndedFilter = unirepContract.filters.EpochEnded()
    const epochEndedEvents =  await unirepContract.queryFilter(epochEndedFilter)
    const sequencerFilter = unirepContract.filters.Sequencer()
    const sequencerEvents =  await unirepContract.queryFilter(sequencerFilter)

    userSignedUpEvents.reverse()
    userStateTransitionedEvents.reverse()
    attestationSubmittedEvents.reverse()
    epochEndedEvents.reverse()

    let latestBlock = 0

    const findEpoch = await Epoch.findOne()
    if (findEpoch === null) {
        const initEpoch = new Epoch({currentEpoch: 1})
        await initEpoch.save()
    }

    for (let i = 0; i < sequencerEvents.length; i++) {
        const sequencerEvent = sequencerEvents[i]
        const blockNumber = sequencerEvent.blockNumber
        latestBlock = blockNumber
        const occurredEvent = sequencerEvent.args?._event
        if (occurredEvent === Event.UserSignedUp) {
            const event = userSignedUpEvents.pop()
            if(event !== undefined) await updateDBFromUnirepUserSignUpEvent(event)
        } else if (occurredEvent === Event.UserStateTransitioned) {
            const event = userStateTransitionedEvents.pop()
            if(event !== undefined) await updateDBFromUSTEvent(event)
        } else if (occurredEvent === Event.AttestationSubmitted) {
            const event = attestationSubmittedEvents.pop()
            if(event !== undefined) await updateDBFromAttestationEvent(event)
        } else if (occurredEvent === Event.EpochEnded) {
            const event = epochEndedEvents.pop()
            if(event !== undefined) await updateDBFromEpochEndedEvent(event)
        }
    }

    // Unirep Social events
    const signUpFilter = unirepSocialContract.filters.UserSignedUp()
    const signUpEvents =  await unirepSocialContract.queryFilter(signUpFilter)

    const postFilter = unirepSocialContract.filters.PostSubmitted()
    const postEvents =  await unirepSocialContract.queryFilter(postFilter)

    const commentFilter = unirepSocialContract.filters.CommentSubmitted()
    const commentEvents =  await unirepSocialContract.queryFilter(commentFilter)

    const voteFilter = unirepSocialContract.filters.VoteSubmitted()
    const voteEvents =  await unirepSocialContract.queryFilter(voteFilter)

    const airdropFilter = unirepSocialContract.filters.AirdropSubmitted()
    const airdropEvents =  await unirepSocialContract.queryFilter(airdropFilter)

    for (const event of signUpEvents) {
        await updateDBFromUserSignUpEvent(event)
    }

    for (const event of postEvents) {
        await updateDBFromPostSubmittedEvent(event)
    }

    for (const event of commentEvents) {
        await updateDBFromCommentSubmittedEvent(event)
    }

    for (const event of voteEvents) {
        await updateDBFromVoteSubmittedEvent(event)
    }

    for (const event of airdropEvents) {
        await updateDBFromAirdropSubmittedEvent(event)
    }

    return latestBlock
}

export {
    getGSTLeaves,
    updateGSTLeaf,
    getEpochTreeLeaves,
    GSTRootExists,
    epochTreeRootExists,
    nullifierExists,
    duplicatedNullifierExists,
    updateDBFromUserSignUpEvent,
    updateDBFromPostSubmittedEvent,
    updateDBFromCommentSubmittedEvent,
    updateDBFromVoteSubmittedEvent,
    updateDBFromAirdropSubmittedEvent,
    updateDBFromUnirepUserSignUpEvent,
    updateDBFromUSTEvent,
    updateDBFromAttestationEvent,
    updateDBFromEpochEndedEvent,
    writeRecord,
    initDB,
}