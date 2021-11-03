import { ethers } from 'ethers'
import mongoose from 'mongoose'
import { add0x, DEFAULT_ETH_PROVIDER, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI } from '../constants'
import Attestations, { IAttestation } from './models/attestation'
import GSTLeaves, { IGSTLeaf, IGSTLeaves } from './models/GSTLeaf'
import Nullifier, { INullifier } from './models/nullifiers'

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

    if(!treeLeaves){
        treeLeaves = new GSTLeaves({
            epoch: _epoch,
            GSTLeaves: [_newLeaf],
        })
    } else {
        if(JSON.stringify(treeLeaves.get('GSTLeaves')).includes(JSON.stringify(_newLeaf)) == true) return
        treeLeaves.get('GSTLeaves').push(_newLeaf)
    }

    const savedTreeLeavesRes = await treeLeaves?.save()

    if( savedTreeLeavesRes ){
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
    const _hashedLeaf = add0x(decodedData?._hashedLeaf._hex)

    const proofIndex = decodedData?._proofIndex
    const results = await verifyNewGSTProofByIndex(proofIndex)
    if (results == undefined) {
        console.log('Proof is invalid, transaction hash', _transactionHash)
        return
    }

    // TODO: check if GST root, epoch tree root exists

    // save the new leaf
    const newLeaf: IGSTLeaf = {
        transactionHash: _transactionHash,
        hashedLeaf: _hashedLeaf
    }
    await updateGSTLeaf(newLeaf, _epoch)

    // TODO: save epoch key nullifiers
    const epkNullifier = results?.args?.userTransitionedData?.epkNullifiers
    for(let nullifier of epkNullifier){
        if(BigInt(nullifier) != BigInt(0))
            await saveNullifier(Number(_epoch), BigInt(nullifier).toString())
    }
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
    const _epoch = event.topics[1]
    const _epochKey = BigInt(event.topics[2]).toString(16)
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
        epoch: Number(_epoch),
        attester: _attester,
        proofIndex: Number(decodedData?._proofIndex),
        attesterId: Number(decodedData?.attestation?.attesterId),
        posRep: Number(decodedData?.attestation?.posRep),
        negRep: Number(decodedData?.attestation?.negRep),
        graffiti: decodedData?.attestation?.graffiti?._hex,
        signUp: Boolean(Number(decodedData?.attestation?.signUp)),
    }

    // TODO: verify GST root

    let attestations = await Attestations.findOne({epochKey: _epochKey})

    if(!attestations){
        attestations = new Attestations({
            epochKey: _epochKey,
            attestations: [newAttestation]
        })
    } else {
        if(JSON.stringify(attestations.get('attestations')).includes(JSON.stringify(newAttestation)) == true) return
        attestations.get('attestations').push(newAttestation)
    }
    
    const res = await attestations?.save()
    if(res){
        console.log('Database: saved submitted attestation')
    }

    // save reputation nullifiers
    for(let nullifier of results?.repNullifiers){
        if(BigInt(nullifier) != BigInt(0))
            await saveNullifier(Number(_epoch), BigInt(nullifier).toString())
    }
}


export {
    updateDBFromNewGSTLeafInsertedEvent,
    updateDBFromAttestationEvent,
}