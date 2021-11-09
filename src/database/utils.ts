import { Attestation, circuitEpochTreeDepth, circuitUserStateTreeDepth, circuitGlobalStateTreeDepth, computeEmptyUserStateRoot, genNewSMT, SMT_ONE_LEAF } from '@unirep/unirep'
import { ethers } from 'ethers'
import { hashLeftRight, IncrementalQuinTree } from '@unirep/crypto'
import mongoose from 'mongoose'
import { add0x, DEFAULT_ETH_PROVIDER, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI, ActionVote } from '../constants'
import Attestations, { IAttestation } from './models/attestation'
import GSTLeaves, { IGSTLeaf, IGSTLeaves } from './models/GSTLeaf'
import GSTRoots, { IGSTRoots } from './models/GSTRoots'
import EpochTreeLeaves, { IEpochTreeLeaf } from './models/epochTreeLeaf'
import Nullifier, { INullifier } from './models/nullifiers'
import Record, { IRecord } from './models/record'
import EpkRecord, { IEpkRecord } from './models/epkRecord'

// /*
// * Connect to db uri
// * @param dbUri mongoose database uri
// */
// const connectDB = async(dbUri: string): Promise<typeof mongoose> => {

//     const db = await mongoose.connect(
//         dbUri, 
//          { useNewUrlParser: true, 
//            useFindAndModify: false, 
//            useUnifiedTopology: true
//          }
//      )
    
//      return db
// }

// /*
// * Initialize the database by dropping the existing database
// * returns true if it is successfully deleted
// * @param db mongoose type database object
// */
// const initDB = async(db: typeof mongoose)=> {

//     const deletedDb = await db.connection.db.dropDatabase()

//     return deletedDb
// }

// /*
// * Disconnect to db uri
// * @param db mongoose type database object
// */
// const disconnectDB = (db: typeof mongoose): void => {

//     db.disconnect()

//     return
// }

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

const nullifierExists = async (nullifier: string, epoch?: number): Promise<boolean> => {
    const n = await Nullifier.findOne({
        $or: [
            {epoch: epoch, nullifier: nullifier},
            {nullifier: nullifier},
        ]
    })
    if (n != undefined) return true
    return false
}

const saveNullifier = async (_epoch: number, _nullifier: string) => {
    const nullifier: INullifier = new Nullifier({
        epoch: _epoch,
        nullifier: _nullifier
    })
    await nullifier.save()
}

const verifyNewGSTProofByIndex = async(proofIndex: number | ethers.BigNumber): Promise<ethers.Event | void> => {
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        provider,
    )
    const signUpFilter = unirepContract.filters.UserSignUp(proofIndex)
    const signUpEvents = await unirepContract.queryFilter(signUpFilter)
    // found user sign up event, then continue
    if (signUpEvents.length == 1) return signUpEvents[0]

    // 2. verify user state transition proof
    const transitionFilter = unirepContract.filters.UserStateTransitionProof(proofIndex)
    const transitionEvents = await unirepContract.queryFilter(transitionFilter)
    if(transitionEvents.length == 0) return
    // proof index is supposed to be unique, therefore it should be only one event found
    const transitionArgs = transitionEvents[0]?.args?.userTransitionedData
    // backward verification
    const isValid = await unirepContract.verifyUserStateTransition(
        transitionArgs.newGlobalStateTreeLeaf,
        transitionArgs.epkNullifiers,
        transitionArgs.transitionFromEpoch,
        transitionArgs.blindedUserStates,
        transitionArgs.fromGlobalStateTree,
        transitionArgs.blindedHashChains,
        transitionArgs.fromEpochTree,
        transitionArgs.proof,
    )
    if(!isValid) return
    
    const _proofIndexes = transitionEvents[0]?.args?._proofIndexRecords
    // Proof index 0 should be the start transition proof
    const startTransitionFilter = unirepContract.filters.StartedTransitionProof(_proofIndexes[0], transitionArgs.blindedUserStates[0], transitionArgs.fromGlobalStateTree)
    const startTransitionEvents = await unirepContract.queryFilter(startTransitionFilter)
    if(startTransitionEvents.length == 0) return

    const startTransitionArgs = startTransitionEvents[0]?.args
    const isStartTransitionProofValid = await unirepContract.verifyStartTransitionProof(
        startTransitionArgs?._blindedUserState,
        startTransitionArgs?._blindedHashChain,
        startTransitionArgs?._globalStateTree,
        startTransitionArgs?._proof,
    )
    if(!isStartTransitionProofValid) return

    // process attestations proofs
    const isProcessAttestationValid = await verifyProcessAttestationEvents(transitionArgs.blindedUserStates[0], transitionArgs.blindedUserStates[1], _proofIndexes)
    if(!isProcessAttestationValid) return

    return transitionEvents[0]
}

const verifyProcessAttestationEvents = async(startBlindedUserState: ethers.BigNumber, finalBlindedUserState: ethers.BigNumber, _proofIndexes: ethers.BigNumber[]): Promise<boolean> => {
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        provider,
    )

    let currentBlindedUserState = startBlindedUserState
    // The rest are process attestations proofs
    for (let i = 1; i < _proofIndexes.length; i++) {
        const processAttestationsFilter = unirepContract.filters.ProcessedAttestationsProof(_proofIndexes[i], currentBlindedUserState)
        const processAttestationsEvents = await unirepContract.queryFilter(processAttestationsFilter)
        if(processAttestationsEvents.length == 0) return false

        const args = processAttestationsEvents[0]?.args
        const isValid = await unirepContract.verifyProcessAttestationProof(
            args?._outputBlindedUserState,
            args?._outputBlindedHashChain,
            args?._inputBlindedUserState,
            args?._proof
        )
        if(!isValid) return false
        currentBlindedUserState = args?._outputBlindedUserState
    }
    return currentBlindedUserState.eq(finalBlindedUserState)
}

const verifyAttestationProofsByIndex = async (proofIndex: number | ethers.BigNumber): Promise<any> => {
    const ethProvider = DEFAULT_ETH_PROVIDER
    const provider = new ethers.providers.JsonRpcProvider(ethProvider)
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        provider,
    )

    const epochKeyProofFilter = unirepContract.filters.EpochKeyProof(proofIndex)
    const epochKeyProofEvent = await unirepContract.queryFilter(epochKeyProofFilter)
    const repProofFilter = unirepContract.filters.ReputationNullifierProof(proofIndex)
    const repProofEvent = await unirepContract.queryFilter(repProofFilter)
    const signUpProofFilter = unirepContract.filters.UserSignedUpProof(proofIndex)
    const signUpProofEvent = await unirepContract.queryFilter(signUpProofFilter)
    let args

    if (epochKeyProofEvent.length == 1){
        console.log('epoch key event')
        args = epochKeyProofEvent[0]?.args?.epochKeyProofData
        const isProofValid = await unirepContract.verifyEpochKeyValidity(
            args?.globalStateTree,
            args?.epoch,
            args?.epochKey,
            args?.proof,
        )
        if (isProofValid) return args
    } else if (repProofEvent.length == 1){
        console.log('rep nullifier event')
        args = repProofEvent[0]?.args?.reputationProofData
        const isProofValid = await unirepContract.verifyReputation(
            args?.repNullifiers,
            args?.epoch,
            args?.epochKey,
            args?.globalStateTree,
            args?.attesterId,
            args?.proveReputationAmount,
            args?.minRep,
            args?.proveGraffiti,
            args?.graffitiPreImage,
            args?.proof,
        )
        if (isProofValid) return args
    } else if (signUpProofEvent.length == 1){
        console.log('sign up event')
        args = signUpProofEvent[0]?.args?.signUpProofData
        const isProofValid = await unirepContract.verifyUserSignUp(
            args?.epoch,
            args?.epochKey,
            args?.globalStateTree,
            args?.attesterId,
            args?.proof,
        )
        if (isProofValid) return args
    }
    return args
}

const updateGSTLeaf = async (
    _newLeaf: IGSTLeaf,
    _epoch: number,
) => {
    let treeLeaves: IGSTLeaves | null = await GSTLeaves.findOne({epoch: _epoch})
    // compute GST root and save GST root
    const emptyUserStateRoot = computeEmptyUserStateRoot(circuitUserStateTreeDepth)
    const defaultGSTLeaf = hashLeftRight(BigInt(0), emptyUserStateRoot)
    const globalStateTree = new IncrementalQuinTree(
        circuitGlobalStateTreeDepth,
        defaultGSTLeaf,
        2,
    )

    if(!treeLeaves){
        treeLeaves = new GSTLeaves({
            epoch: _epoch,
            GSTLeaves: [_newLeaf],
        })
        globalStateTree.insert(BigInt(_newLeaf.hashedLeaf))
    } else {
        if(JSON.stringify(treeLeaves.get('GSTLeaves')).includes(JSON.stringify(_newLeaf)) == true) return
        treeLeaves.get('GSTLeaves').push(_newLeaf)

        for(let leaf of treeLeaves.get('GSTLeaves.hashedLeaf')){
            globalStateTree.insert(leaf)
        }
    }
    const savedTreeLeavesRes = await treeLeaves?.save()

    // save the root
    let treeRoots: IGSTRoots | null = await GSTRoots.findOne({epoch: _epoch})
    if(!treeRoots){
        treeRoots = new GSTRoots({
            epoch: _epoch,
            GSTRoots: [globalStateTree.root.toString()],
        })
    } else {
        treeRoots.get('GSTRoots').push(globalStateTree.root.toString())
    }
    const savedTreeRootsRes = await treeRoots.save()
    if( savedTreeRootsRes && savedTreeLeavesRes) {
        console.log('Database: saved new GST event')
    }
}

/*
* When a newGSTLeafInserted event comes
* update the database
* @param event newGSTLeafInserted event
*/

const updateDBFromNewGSTLeafInsertedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const decodedData = iface.decodeEventLog("NewGSTLeafInserted",event.data)

    const _transactionHash = event.transactionHash
    const _epoch = Number(event?.topics[1])
    const _hashedLeaf = BigInt(decodedData?._hashedLeaf).toString()

    const proofIndex = decodedData?._proofIndex
    const results = await verifyNewGSTProofByIndex(proofIndex)
    if (results == undefined) {
        console.log('Proof is invalid, transaction hash', _transactionHash)
        return
    }

    // save epoch key nullifiers
    if (results?.event == "UserStateTransitionProof") {
        // check if GST root, epoch tree root exists
        const epoch = results?.args?.userTransitionedData?.transitionFromEpoch
        const GSTRoot = results?.args?.userTransitionedData?.fromGlobalStateTree
        const epochTreeRoot = results?.args?.userTransitionedData?.fromEpochTree
        const isGSTExisted = await GSTRootExists(epoch, GSTRoot)
        const isEpochTreeExisted = await epochTreeRootExists(epoch, epochTreeRoot)
        if(!isGSTExisted) {
            console.log('Global state tree root mismatches')
            return
        }
        if(!isEpochTreeExisted) {
            console.log('Epoch tree root mismatches')
            return
        }

        const epkNullifier = results?.args?.userTransitionedData?.epkNullifiers
        for(let nullifier of epkNullifier){
            if(BigInt(nullifier) != BigInt(0))
                await saveNullifier(Number(_epoch), BigInt(nullifier).toString())
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
*/
const updateDBFromAttestationEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _epoch = Number(event.topics[1])
    const _epochKey = BigInt(event.topics[2]).toString()
    const _attester = event.topics[3]
    const decodedData = iface.decodeEventLog("AttestationSubmitted",event.data)
    const proofIndex = decodedData?._proofIndex

    const results = await verifyAttestationProofsByIndex(proofIndex)
    if (results == undefined) {
        console.log('Proof is invalid, transaction hash', event.transactionHash)
        return
    }

    const newAttestation: IAttestation = {
        transactionHash: event.transactionHash,
        attester: _attester,
        proofIndex: Number(decodedData?._proofIndex),
        attesterId: Number(decodedData?.attestation?.attesterId),
        posRep: Number(decodedData?.attestation?.posRep),
        negRep: Number(decodedData?.attestation?.negRep),
        graffiti: decodedData?.attestation?.graffiti?._hex,
        signUp: Boolean(Number(decodedData?.attestation?.signUp)),
    }

    const isGSTExisted = await GSTRootExists(Number(results?.epoch), BigInt(results?.globalStateTree).toString())
    if(!isGSTExisted) {
        console.log('Global state tree root mismatches')
        return
    }

    let attestations = await Attestations.findOne({epochKey: _epochKey})
    const attestation = new Attestation(
        BigInt(decodedData?.attestation?.attesterId),
        BigInt(decodedData?.attestation?.posRep),
        BigInt(decodedData?.attestation?.negRep),
        BigInt(decodedData?.attestation?.graffiti?._hex),
        BigInt(decodedData?.attestation?.signUp)
    )

    if(!attestations){
        attestations = new Attestations({
            epoch: _epoch,
            epochKey: _epochKey,
            epochKeyToHashchainMap: hashLeftRight(attestation.hash(), BigInt(0)),
            attestations: [newAttestation]
        })
    } else {
        if(JSON.stringify(attestations.get('attestations')).includes(JSON.stringify(newAttestation)) == true) return
        const hashChainResult = attestations.get('epochKeyToHashchainMap')
        const newHashChainResult = hashLeftRight(attestation.hash(), hashChainResult)
        attestations.get('attestations').push(newAttestation)
        attestations.set('epochKeyToHashchainMap', newHashChainResult)
    }
    
    const res = await attestations?.save()
    if(res){
        console.log('Database: saved submitted attestation')
    }

    // save reputation nullifiers
    if (results?.repNullifiers != undefined) {
        for(let nullifier of results?.repNullifiers){
            if(BigInt(nullifier) != BigInt(0))
                await saveNullifier(Number(_epoch), BigInt(nullifier).toString())
        }
    }
}

/*
* When an EpochEnded event comes
* update the database
* @param event EpochEnded event
* @param address The address of the Unirep contract
* @param provider An Ethereum provider
*/
const updateDBFromEpochEndedEvent = async (
    event: ethers.Event,
    startBlock: number  = DEFAULT_START_BLOCK,
) => {

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    // update Unirep state
    const epoch = Number(event?.topics[1])

    // Get epoch tree leaves of the ending epoch
    let attestations = await Attestations.find({epoch: epoch})
    const epochTree = await genNewSMT(circuitEpochTreeDepth, SMT_ONE_LEAF)
    const epochTreeLeaves: IEpochTreeLeaf[] = []

    // seal all epoch keys in current epoch
    for (let attestation of attestations) {
        const hashchainResult = attestation?.get('epochKeyToHashchainMap')
        const sealedHashchain = hashLeftRight(
            BigInt(1),
            BigInt(hashchainResult)
        )
        const epochTreeLeaf: IEpochTreeLeaf = {
            epochKey: attestation?.get('epochKey'),
            hashchainResult: sealedHashchain.toString()
        }
        epochTreeLeaves.push(epochTreeLeaf)
    }

    // Add to epoch key hash chain map
    for (let leaf of epochTreeLeaves) {
        await epochTree.update(BigInt(leaf.epochKey), BigInt(leaf.hashchainResult))
    }

    const newEpochTreeLeaves = new EpochTreeLeaves({
        epoch: epoch,
        epochTreeLeaves: epochTreeLeaves,
        epochTreeRoot: epochTree.getRootHash(),
    })

    await newEpochTreeLeaves.save()
}

const writeRecord = async (to: string, from: string, posRep: number, negRep: number, epoch: number, action: string, data: string) => {
    const newRecord: IRecord = new Record({
        to,
        from,
        upvote: posRep,
        downvote: negRep,
        epoch,
        action,
        data,
    });

    if (action === ActionVote) {
        EpkRecord.findOneAndUpdate(
            {epk: from, epoch}, 
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: posRep + negRep} },
            { "new": true, "upsert": true }, 
            (err, record) => {
                console.log('update voter record is: ' + record);
                if (err !== null) {
                    console.log('update voter epk record error: ' + err);
                }
        });

        EpkRecord.findOneAndUpdate(
            {epk: to, epoch}, 
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep, negRep} },
            { "new": true, "upsert": true }, 
            (err, record) => {
                console.log('update receiver record is: ' + record);
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
                console.log('update action record is: ' + record);
                if (err !== null) {
                    console.log('update action epk record error: ' + err);
                }
            });
    }

    await newRecord.save();
}

export {
    getGSTLeaves,
    getEpochTreeLeaves,
    GSTRootExists,
    epochTreeRootExists,
    nullifierExists,
    updateDBFromNewGSTLeafInsertedEvent,
    updateDBFromAttestationEvent,
    updateDBFromEpochEndedEvent,
    writeRecord,
}