import { Attestation, circuitUserStateTreeDepth, circuitGlobalStateTreeDepth, computeEmptyUserStateRoot, computeInitUserStateRoot, genUnirepStateFromContract, } from '@unirep/unirep'
import base64url from 'base64url';
import { ethers } from 'ethers'
import { getUnirepContract, Event, AttestationEvent, EpochKeyProof, ReputationProof, SignUpProof, UserTransitionProof } from '@unirep/contracts';
import { hashLeftRight, IncrementalQuinTree, stringifyBigInts } from '@unirep/crypto'
import { DEFAULT_COMMENT_KARMA, DEFAULT_ETH_PROVIDER, DEFAULT_POST_KARMA, DEFAULT_START_BLOCK, UNIREP, UNIREP_ABI, UNIREP_SOCIAL_ABI, ActionType, DEFAULT_AIRDROPPED_KARMA, titlePrefix, titlePostfix, reputationProofPrefix, reputationPublicSignalsPrefix, signUpProofPrefix, signUpPublicSignalsPrefix, epkProofPrefix, epkPublicSignalsPrefix, USTPublicSignalsPrefix, USTProofPrefix, DEFAULT_QUERY_DEPTH, QUERY_DELAY_TIME, } from '../constants'
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
import { Circuit, formatProofForSnarkjsVerification, verifyProof } from '@unirep/circuits';
import { decodeReputationProof, decodeSignUpProof } from '../controllers/utils';

const decodeEpochKeyProof = (proof: string, publicSignals: string) => {
    const decodedProof = base64url.decode(proof.slice(epkProofPrefix.length))
    const decodedPublicSignals = base64url.decode(publicSignals.slice(epkPublicSignalsPrefix.length))
    const publicSignals_ = JSON.parse(decodedPublicSignals)
    const proof_ = JSON.parse(decodedProof)
    return { publicSignals: publicSignals_, proof: proof_ }
}

const decodeUSTProof = (proof: string, publicSignals: string) => {
    const decodedProof = base64url.decode(proof.slice(USTProofPrefix.length))
    const decodedPublicSignals = base64url.decode(publicSignals.slice(USTPublicSignalsPrefix.length))
    const publicSignals_ = JSON.parse(decodedPublicSignals)
    const proof_ = JSON.parse(decodedProof)
    return { publicSignals: publicSignals_, proof: proof_ }
}

const encodeBigIntArray = (arr: BigInt[]): string => {
    return base64url.encode(JSON.stringify(stringifyBigInts(arr)))
}

const getCurrentEpoch = async (): Promise<number> => {
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER);
    const epoch = await unirepContract.currentEpoch()
    return Number(epoch);
}

const getGSTLeaves = async (epoch: number): Promise<IGSTLeaf[]> => {
    const leaves = await GSTLeaves.findOne({epoch: epoch})
    return leaves? leaves.GSTLeaves : []
}

const getEpochTreeLeaves = async (epoch: number): Promise<IEpochTreeLeaf[]> => {
    const leaves = await EpochTreeLeaves.findOne({epoch: epoch})
    return leaves? leaves.epochTreeLeaves : []
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
    else {
        console.log('Global state tree is not stored successfully');
        const unirepState = await genUnirepStateFromContract(
            DEFAULT_ETH_PROVIDER,
            UNIREP
        )
        const exist = unirepState.GSTRootExists(GSTRoot, epoch);
        if (exist) {
            await insertGSTRoot(epoch, GSTRoot.toString());
            return true
        }
    }
    return false
}

const epochTreeRootExists = async (epoch: number, epochTreeRoot: string | BigInt): Promise<boolean> => {
    const currentEpoch = await getCurrentEpoch();
    if (epoch >= currentEpoch) {
        return false
    }
    const root = await EpochTreeLeaves.findOne({
        epoch: epoch, 
        epochTreeRoot: epochTreeRoot.toString()
    })
    if(root !== null) return true
    else {
        console.log('Epoch tree is not stored successfully');
        const findEpoch = await EpochTreeLeaves.findOne({
            epoch: epoch,
        })
        if (findEpoch === null) {
            const unirepState = await genUnirepStateFromContract(
                DEFAULT_ETH_PROVIDER,
                UNIREP
            )
            const epochTree = await unirepState.genEpochTree(epoch)
            const newEpochTreeLeaves = new EpochTreeLeaves({
                epoch: epoch,
                epochTreeRoot: epochTree.getRootHash().toString(),
            })
        
            try {
                const res = await newEpochTreeLeaves.save()
                console.log(res)
            } catch(e) {
                console.log(e)
            }
            if (epochTreeRoot.toString() === newEpochTreeLeaves.epochTreeRoot) return true
        }
    }
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

const _fallBack = () => {
    return
}

const verifyUSTProofByIndex = async(
    proofIndex: number, 
    epoch: number, 
    transactionHash: string,
): Promise<Boolean> => {
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)

    // verify user state transition proof
    let transitionProof = await Proof.findOne({index: proofIndex})
    if (transitionProof === null) {
        for (let l = 0; l < DEFAULT_QUERY_DEPTH; l++) {
            console.log('UST proof index', proofIndex, 'not found, try again')
            const transitionFilter = unirepContract.filters.IndexedUserStateTransitionProof(proofIndex)
            const transitionEvents = await unirepContract.queryFilter(transitionFilter)
            if (transitionEvents.length === 1) {
                await updateDBFromUSTProofEvent(transitionEvents[0])
                transitionProof = await Proof.findOne({index: proofIndex})
                break
            } else {
                setTimeout(_fallBack, QUERY_DELAY_TIME);
            }        
        }
    }
    if (transitionProof?.valid === false ||
        transitionProof?.event !== "IndexedUserStateTransitionProof") {
        console.log('User State Transition Proof index: ', proofIndex, ' is invalid');
        return false
    }
    const proofIndexRecords = transitionProof?.proofIndexRecords

    // find start user state transition proof
    let startTransitionProof = await Proof.findOne({index: proofIndexRecords[0]})
    if (startTransitionProof === null) {
        for (let l = 0; l < DEFAULT_QUERY_DEPTH; l++) {
            console.log('Start UST proof index', proofIndexRecords[0], 'not found, try again')
            const startTransitionFilter = unirepContract.filters.IndexedStartedTransitionProof(
                proofIndexRecords[0],
            )
            const startTransitionEvents = await unirepContract.queryFilter(startTransitionFilter)
            if (startTransitionEvents.length === 1) {
                await updateDBFromStartUSTProofEvent(startTransitionEvents[0])
                startTransitionProof = await Proof.findOne({index: proofIndexRecords[0]})
                break
            } else {
                setTimeout(_fallBack, QUERY_DELAY_TIME);
            }
        }
    } else if (startTransitionProof?.valid === false ||
        startTransitionProof?.event !== "IndexedStartedTransitionProof") {
        console.log('Start Transition Proof index: ', proofIndexRecords[0], ' is invalid');
        return false
    } else {
        if (startTransitionProof?.blindedUserState !== transitionProof?.blindedUserState ||
            startTransitionProof?.globalStateTree !== transitionProof?.globalStateTree) {
            console.log('Start Transition Proof index: ', proofIndexRecords[0], ' mismatch UST proof')
            return false
        }
    }

    // find process attestations proof
    let currentBlindedUserState = startTransitionProof?.blindedUserState
    for (let i = 1; i < proofIndexRecords.length; i++) {
        let processAttestationsProof = await Proof.findOne({
            index: proofIndexRecords[i],
        })
        if (processAttestationsProof === null) {
            for (let l = 0; l < DEFAULT_QUERY_DEPTH; l++) {
                console.log('Process attestations proof index', proofIndexRecords[i], 'not found, try again')
                const processAttestationsFilter = unirepContract.filters.IndexedProcessedAttestationsProof(
                    proofIndexRecords[i]
                )
                const events = await unirepContract.queryFilter(processAttestationsFilter)
                if (events.length === 1) {
                    await updateDBFromProcessAttestationProofEvent(events[0])
                    processAttestationsProof = await Proof.findOne({
                        index: proofIndexRecords[i],
                    })
                    break
                } else {
                    setTimeout(_fallBack, QUERY_DELAY_TIME);
                }
            }
        } else if (processAttestationsProof?.valid === false ||
            processAttestationsProof?.event !== "IndexedProcessedAttestationsProof") {
            console.log('Process Attestations Proof index: ', proofIndexRecords[i], ' is invalid');
            return false
        } else {
            if (currentBlindedUserState !== processAttestationsProof?.inputBlindedUserState) {
                console.log('Process Attestations Proof index: ', proofIndexRecords[i], ' mismatch UST proof');
                return false
            }
        }
        currentBlindedUserState = processAttestationsProof?.outputBlindedUserState
    }

    // verify blinded hash chain result
    const { publicSignals, proof } = decodeUSTProof(transitionProof.proof, transitionProof.publicSignals)
    const formatProof = new UserTransitionProof(publicSignals, formatProofForSnarkjsVerification(proof))
    for (const blindedHC of formatProof.blindedHashChains) {
        let allProofIndexQuery: any[] = []
        for (let idx of proofIndexRecords) {
            allProofIndexQuery.push({index: idx})
        }
        const query = {
            $and: [
                {
                    outputBlindedHashChain: `${blindedHC.toString()}`
                },
                { $or: allProofIndexQuery }
            ]
        }
        const findBlindHC = await Proof.findOne(query)
        const inList = proofIndexRecords.indexOf(findBlindHC?.index)
        if (inList === -1) {
            console.log('Proof in UST mismatches proof in process attestations')
            return false
        }
    }

    // save epoch key nullifiers
    // check if GST root, epoch tree root exists
    const fromEpoch = Number(formatProof?.transitionFromEpoch)
    const GSTRoot = formatProof?.fromGlobalStateTree.toString()
    const epochTreeRoot = formatProof?.fromEpochTree.toString()
    const epkNullifier = formatProof?.epkNullifiers.map(n => n.toString())
    const isGSTExisted = await GSTRootExists(fromEpoch, GSTRoot)
    const isEpochTreeExisted = await epochTreeRootExists(fromEpoch, epochTreeRoot)
    if(!isGSTExisted) {
        console.log('Global state tree root mismatches')
        return false
    }
    if(!isEpochTreeExisted) {
        console.log('Epoch tree root mismatches')
        return false
    }

    // check and save nullifiers
    const success = await checkAndSaveNullifiers(epoch, epkNullifier, transactionHash)
    if (!success) {
        console.log(`duplicated nullifier`)
        return false
    }

    return true
}

const verifyAttestationProofsByIndex = async (proofIndex: number): Promise<any> => {
    let proof_ = await Proof.findOne({index: proofIndex})
    let formatProof
    if (proof_ !== null) {
        if (proof_.event === "IndexedEpochKeyProof") {
            const { publicSignals, proof } = decodeEpochKeyProof(proof_.proof, proof_.publicSignals)
            formatProof = new EpochKeyProof(publicSignals, formatProofForSnarkjsVerification(proof))
        } else if (proof_.event === "IndexedReputationProof") {
            const { publicSignals, proof } = decodeReputationProof(proof_.proof, proof_.publicSignals)
            formatProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
        } else if (proof_.event === "IndexedUserSignedUpProof") {
            const { publicSignals, proof } = decodeSignUpProof(proof_.proof, proof_.publicSignals)
            formatProof = new SignUpProof(publicSignals, formatProofForSnarkjsVerification(proof))
        } else {
            console.log(`proof index ${proofIndex} matches wrong event ${proof_?.event}`);
            return {isProofValid: false, proof: formatProof}
        }
    } else {
        for (let l = 0; l < DEFAULT_QUERY_DEPTH; l++) {
            console.log('Attestation proof index', proofIndex, 'not found, try again')
            const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)
            const epochKeyProofFilter = unirepContract.filters.IndexedEpochKeyProof(proofIndex)
            const epochKeyProofEvents = await unirepContract.queryFilter(epochKeyProofFilter)
            if (epochKeyProofEvents.length === 1) {
                await updateDBFromEpochKeyProofEvent(epochKeyProofEvents[0])
                proof_ = await Proof.findOne({index: proofIndex})
                if (proof_?.event === "IndexedEpochKeyProof") {
                    const { publicSignals, proof } = decodeEpochKeyProof(proof_?.proof, proof_?.publicSignals)
                    formatProof = new EpochKeyProof(publicSignals, formatProofForSnarkjsVerification(proof))
                }
                break
            }
            const reputationProofFilter = unirepContract.filters.IndexedReputationProof(proofIndex)
            const reputationProofEvents = await unirepContract.queryFilter(reputationProofFilter)
            if (reputationProofEvents.length === 1) {
                await updateDBFromReputationProofEvent(reputationProofEvents[0])
                proof_ = await Proof.findOne({index: proofIndex})
                if (proof_?.event === "IndexedReputationProof") {
                    const { publicSignals, proof } = decodeReputationProof(proof_?.proof, proof_?.publicSignals)
                    formatProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
                }
                break
            }
            const signUpProofFilter = unirepContract.filters.IndexedUserSignedUpProof(proofIndex)
            const signUpProofEvents = await unirepContract.queryFilter(signUpProofFilter)
            if (signUpProofEvents.length === 1) {
                await updateDBFromUserSignedUpProofEvent(signUpProofEvents[0])
                proof_ = await Proof.findOne({index: proofIndex})
                if (proof_?.event === "IndexedUserSignedUpProof") {
                    const { publicSignals, proof } = decodeSignUpProof(proof_?.proof, proof_?.publicSignals)
                    formatProof = new SignUpProof(publicSignals, formatProofForSnarkjsVerification(proof))
                }
                break
            }
            setTimeout(_fallBack, QUERY_DELAY_TIME);
        }
    }

    let isProofValid = await formatProof.verify()
    if(!isProofValid) {
        console.log('Proof index ', proofIndex, ' is invalid')
        return {isProofValid, proof: formatProof}
    }
    
    // const args = event?.args
    const epoch = Number(formatProof?.epoch)
    const GSTRoot = BigInt(formatProof?.globalStateTree).toString()
    const isGSTExisted = await GSTRootExists(epoch, GSTRoot)
    if(!isGSTExisted) {
        isProofValid = false
        console.log('Global state tree root mismatches')
        await Proof.findOneAndUpdate({
            index: proofIndex,
        }, {
            valid: false
        })
    }
    return {isProofValid, proof: formatProof}
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

const findAttestationEventFromFilter = async (proofIndex: number) => {
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)
    let isProofValid = false
    let event

    const epochKeyProofFilter = unirepContract.filters.IndexedEpochKeyProof(proofIndex)
    const epochKeyProofEvent = await unirepContract.queryFilter(epochKeyProofFilter, DEFAULT_START_BLOCK)
    if (epochKeyProofEvent.length == 1){
        await updateDBFromEpochKeyProofEvent(epochKeyProofEvent[0])
    }
    const repProofFilter = unirepContract.filters.IndexedReputationProof(proofIndex)
    const repProofEvent = await unirepContract.queryFilter(repProofFilter, DEFAULT_START_BLOCK)
    if (repProofEvent.length == 1){
        await updateDBFromReputationProofEvent(repProofEvent[0])
    }
    const signUpProofFilter = unirepContract.filters.IndexedUserSignedUpProof(proofIndex)
    const signUpProofEvent = await unirepContract.queryFilter(signUpProofFilter, DEFAULT_START_BLOCK)
    if (signUpProofEvent.length == 1){
        await updateDBFromUserSignedUpProofEvent(signUpProofEvent[0])
    }

    return await verifyAttestationProofsByIndex(proofIndex)
}

/*
* When a EpochKeyProof event comes
* update the database
* @param event IndexedEpochKeyProof event
*/
const updateDBFromEpochKeyProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return

    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const _epoch = Number(event.topics[2])
    const decodedData = iface.decodeEventLog("IndexedEpochKeyProof", event.data)
    const args = decodedData?._proof

    const emptyArray = []
    const formatPublicSignals = emptyArray.concat(
        args?.globalStateTree,
        args?.epoch,
        args?.epochKey,
    ).map(n => BigInt(n))
    const formattedProof = args?.proof.map(n => BigInt(n))
    const encodedProof = encodeBigIntArray(formattedProof)
    const encodedPublicSignals = encodeBigIntArray(formatPublicSignals)
    const proof = epkProofPrefix + encodedProof
    const publicSignals = epkPublicSignalsPrefix + encodedPublicSignals
    const isValid = await verifyProof(
        Circuit.verifyEpochKey, 
        formatProofForSnarkjsVerification(formattedProof), 
        formatPublicSignals
    )

    const newProof = new Proof({
        index: _proofIndex,
        epoch: _epoch,
        proof: proof,
        publicSignals: publicSignals,
        transactionHash: event.transactionHash,
        event: "IndexedEpochKeyProof",
        valid: isValid,
    })
    try {
        await newProof.save()
    } catch (error) {
        return
    }
}

/*
* When a ReputationProof event comes
* update the database
* @param event IndexedReputationProof event
*/
const updateDBFromReputationProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return
    
    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const _epoch = Number(event.topics[2])
    const decodedData = iface.decodeEventLog("IndexedReputationProof", event.data)
    const args = decodedData?._proof
    const emptyArray = []
    const formatPublicSignals = emptyArray.concat(
        args?.repNullifiers,
        args?.epoch,
        args?.epochKey,
        args?.globalStateTree,
        args?.attesterId,
        args?.proveReputationAmount,
        args?.minRep,
        args?.proveGraffiti,
        args?.graffitiPreImage,
    ).map(n => BigInt(n))
    const formattedProof = args?.proof.map(n => BigInt(n))
    const encodedProof = encodeBigIntArray(formattedProof)
    const encodedPublicSignals = encodeBigIntArray(formatPublicSignals)
    const proof = reputationProofPrefix + encodedProof
    const publicSignals = reputationPublicSignalsPrefix + encodedPublicSignals
    const isValid = await verifyProof(
        Circuit.proveReputation, 
        formatProofForSnarkjsVerification(formattedProof), 
        formatPublicSignals
    )

    const newProof = new Proof({
        index: _proofIndex,
        epoch: _epoch,
        proof: proof,
        publicSignals: publicSignals,
        transactionHash: event.transactionHash,
        event: "IndexedReputationProof",
        valid: isValid
    })
    try {
        await newProof.save()
    } catch (error) {
        return
    }
}

/*
* When a UserSignedUpProof event comes
* update the database
* @param event IndexedUserSignedUpProof event
*/
const updateDBFromUserSignedUpProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return
    
    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const _epoch = Number(event.topics[2])
    const decodedData = iface.decodeEventLog("IndexedUserSignedUpProof", event.data)
    const args = decodedData?._proof

    const emptyArray = []
    const formatPublicSignals = emptyArray.concat(
        args?.epoch,
        args?.epochKey,
        args?.globalStateTree,
        args?.attesterId,
        args?.userHasSignedUp,
    ).map(n => BigInt(n))
    const formattedProof = args?.proof.map(n => BigInt(n))
    const encodedProof = encodeBigIntArray(formattedProof)
    const encodedPublicSignals = encodeBigIntArray(formatPublicSignals)
    const proof = signUpProofPrefix + encodedProof
    const publicSignals = signUpPublicSignalsPrefix + encodedPublicSignals
    const isValid = await verifyProof(
        Circuit.proveUserSignUp, 
        formatProofForSnarkjsVerification(formattedProof), 
        formatPublicSignals
    )
    
    const newProof = new Proof({
        index: _proofIndex,
        epoch: _epoch,
        proof: proof,
        publicSignals: publicSignals,
        transactionHash: event.transactionHash,
        event: "IndexedUserSignedUpProof",
        valid: isValid
    })
    try {
        await newProof.save()
    } catch (error) {
        return
    }
}

/*
* When a StartTransition event comes
* update the database
* @param event IndexedStartedTransitionProof event
*/
const updateDBFromStartUSTProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return
    
    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const _blindedUserState = BigInt(event.topics[2])
    const _globalStateTree = BigInt(event.topics[3])
    const decodedData = iface.decodeEventLog("IndexedStartedTransitionProof", event.data)
    const _blindedHashChain = BigInt(decodedData?._blindedHashChain)
    const formatProof = formatProofForSnarkjsVerification(decodedData?._proof)
    const encodedProof = base64url.encode(JSON.stringify(stringifyBigInts(formatProof)))
    const formatPublicSignals = [
        _blindedUserState,
        _blindedHashChain,
        _globalStateTree,
    ]
    const isValid = await verifyProof(
        Circuit.startTransition, 
        formatProof, 
        formatPublicSignals
    )
    
    const newProof = new Proof({
        index: _proofIndex,
        blindedUserState: _blindedUserState,
        blindedHashChain: _blindedHashChain,
        globalStateTree: _globalStateTree,
        proof: encodedProof,
        transactionHash: event.transactionHash,
        event: "IndexedStartedTransitionProof",
        valid: isValid
    })
    try {
        await newProof.save()
    } catch (error) {
        return
    }
}

/*
* When a ProcessAttestation event comes
* update the database
* @param event IndexedProcessedAttestationsProof event
*/
const updateDBFromProcessAttestationProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return
    
    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const _inputBlindedUserState = BigInt(event.topics[2])
    const decodedData = iface.decodeEventLog("IndexedProcessedAttestationsProof", event.data)
    const _outputBlindedUserState = BigInt(decodedData?._outputBlindedUserState)
    const _outputBlindedHashChain = BigInt(decodedData?._outputBlindedHashChain)
    const formatProof = formatProofForSnarkjsVerification(decodedData?._proof)
    const encodedProof = base64url.encode(JSON.stringify(stringifyBigInts(formatProof)))
    const formatPublicSignals = [
        _outputBlindedUserState,
        _outputBlindedHashChain,
        _inputBlindedUserState,
    ]
    const isValid = await verifyProof(
        Circuit.processAttestations, 
        formatProof, 
        formatPublicSignals
    )

    const newProof = new Proof({
        index: _proofIndex,
        outputBlindedUserState: _outputBlindedUserState,
        outputBlindedHashChain: _outputBlindedHashChain,
        inputBlindedUserState: _inputBlindedUserState,
        proof: encodedProof,
        transactionHash: event.transactionHash,
        event: "IndexedProcessedAttestationsProof",
        valid: isValid
    })
    
    try {
        await newProof.save()
    } catch (error) {
        return
    }
}

/*
* When a UserStateTransition event comes
* update the database
* @param event IndexedUserStateTransitionProof event
*/
const updateDBFromUSTProofEvent = async (
    event: ethers.Event,
    startBlock: number = DEFAULT_START_BLOCK,
) => {
    // The event has been processed
    if(event.blockNumber <= startBlock) return
    
    const iface = new ethers.utils.Interface(UNIREP_ABI)
    const _proofIndex = Number(event.topics[1])
    const decodedData = iface.decodeEventLog("IndexedUserStateTransitionProof", event.data)
    const args = decodedData?._proof
    const proofIndexRecords = decodedData?._proofIndexRecords.map(n => Number(n))

    const emptyArray = []
    let formatPublicSignals = emptyArray.concat(
        args.newGlobalStateTreeLeaf,
        args.epkNullifiers,
        args.transitionFromEpoch,
        args.blindedUserStates,
        args.fromGlobalStateTree,
        args.blindedHashChains,
        args.fromEpochTree,
    ).map(n => BigInt(n))
    const formattedProof = args?.proof.map(n => BigInt(n))
    const encodedProof = encodeBigIntArray(formattedProof)
    const encodedPublicSignals = encodeBigIntArray(formatPublicSignals)
    const proof = USTProofPrefix + encodedProof
    const publicSignals = USTPublicSignalsPrefix + encodedPublicSignals

    const newProof = new Proof({
        index: _proofIndex,
        proof: proof,
        publicSignals: publicSignals,
        blindedUserState: args.blindedUserStates[0],
        globalStateTree: args.fromGlobalStateTree,
        proofIndexRecords: proofIndexRecords,
        transactionHash: event.transactionHash,
        event: "IndexedUserStateTransitionProof",
    })
    
    try {
        await newProof.save()
    } catch (error) {
        return
    }
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
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)

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
    } else if (findValidProof?.valid === undefined) {
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
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)
        
    const reputationProof = decodedData?.proofRelated
    const proofNullifier = await unirepContract.hashReputationProof(reputationProof)
    const proofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

    const findValidProof = await Proof.findOne({index: proofIndex, epoch: _epoch})
    if (findValidProof?.valid === false) {
        console.log(`proof index ${proofIndex} is invalid`)
        return
    } else if (findValidProof?.valid === undefined) {
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
    
    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)
        
    const reputationProof = decodedData?.proofRelated
    const proofNullifier = await unirepContract.hashReputationProof(reputationProof)
    const fromProofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

    const findValidProof = await Proof.findOne({index: _toEpochKeyProofIndex, epoch: _epoch})
    if (findValidProof?.valid === false) {
        console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
        return
    } else if (findValidProof?.valid === undefined) {
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

    const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)
    
    const proofNullifier = await unirepContract.hashSignUpProof(signUpProof)
    const proofIndex = Number(await unirepContract.getProofIndex(proofNullifier))

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
    const proofIndex = Number(decodedData?._proofIndex)

    const isValid = await verifyUSTProofByIndex(
        proofIndex,
        _epoch, 
        event.transactionHash
    )
    if (isValid === false) {
        console.log('Proof is invalid, transaction hash', _transactionHash)
        return
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
    else if (validProof?.valid === undefined) {
        const { isProofValid, proof } = await verifyAttestationProofsByIndex(toProofIndex)
        if (isProofValid === false || proof === undefined) {
            console.log(`receiver epoch key ${_epochKey} of proof index ${toProofIndex} is invalid`)
            await Proof.findOneAndUpdate({
                epoch: _epoch, 
                index: toProofIndex
            }, {
                valid: false
            })
            await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
            return
        }
        if (Number(proof?.epoch) !== _epoch) {
            console.log(`receiver epoch key is not in the current epoch`)
            return
        }
        if (BigInt(_epochKey) !== BigInt(proof?.epochKey)) { 
            console.log(`epoch key mismath in the proof index ${toProofIndex}`)
            return
        }
        if (decodedData?._event === AttestationEvent.SpendReputation) {
            // check nullifiers
            const repNullifiers = proof?.repNullifiers.map(n => BigInt(n).toString())
            const success = await checkAndSaveNullifiers(_epoch, repNullifiers, event.transactionHash)
            if (!success) {
                console.log(`duplicated nullifiers`)
                await Proof.findOneAndUpdate({
                    epoch: _epoch, 
                    index: toProofIndex
                }, {
                    valid: false
                })
                await saveAttestationResult(_epoch, _epochKey.toString(16), attestIndex, false)
                return
            }
        } 
        await Proof.findOneAndUpdate({
            epoch: _epoch, 
            index: toProofIndex
        }, {
            valid: true
        })
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
    console.log('update db from epoch ended event: ');
    console.log(event);

    // The event has been processed
    if(event.blockNumber <= startBlock) return

    // update Unirep state
    const epoch = Number(event?.topics[1])
    const findEpochTree = await EpochTreeLeaves.findOne({epoch: epoch})
    if (findEpochTree !== null) return
    await Epoch.findOneAndUpdate({currentEpoch: epoch}, {currentEpoch: epoch + 1})

    // get epoch tree from @unirep/unirep core function
    const unirepState = await genUnirepStateFromContract(DEFAULT_ETH_PROVIDER, UNIREP)
    const epochTree = await unirepState.genEpochTree(epoch)

    const newEpochTreeLeaves = new EpochTreeLeaves({
        epoch: epoch,
        epochTreeRoot: epochTree.getRootHash().toString(),
    })

    try {
        const res = await newEpochTreeLeaves.save()
        console.log(res)
    } catch(e) {
        console.log(e)
    }
    global.nextEpochTransition = Date.now() + global.epochPeriod + 30000; // delay 30 seconds
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
    const userSignedUpEvents =  await unirepContract.queryFilter(userSignedUpFilter, DEFAULT_START_BLOCK)
    const userStateTransitionedFilter = unirepContract.filters.UserStateTransitioned()
    const userStateTransitionedEvents = await unirepContract.queryFilter(userStateTransitionedFilter, DEFAULT_START_BLOCK)
    const attestationSubmittedFilter = unirepContract.filters.AttestationSubmitted()
    const attestationSubmittedEvents =  await unirepContract.queryFilter(attestationSubmittedFilter, DEFAULT_START_BLOCK)
    const epochEndedFilter = unirepContract.filters.EpochEnded()
    const epochEndedEvents =  await unirepContract.queryFilter(epochEndedFilter, DEFAULT_START_BLOCK)
    const sequencerFilter = unirepContract.filters.Sequencer()
    const sequencerEvents =  await unirepContract.queryFilter(sequencerFilter, DEFAULT_START_BLOCK)

    const epochKeyProofFilter = unirepContract.filters.IndexedEpochKeyProof()
    const epochKeyProofEvents = await unirepContract.queryFilter(epochKeyProofFilter, DEFAULT_START_BLOCK)
    const reputationProofFilter = unirepContract.filters.IndexedReputationProof()
    const reputationProofEvents = await unirepContract.queryFilter(reputationProofFilter, DEFAULT_START_BLOCK)
    const signUpProofFilter = unirepContract.filters.IndexedUserSignedUpProof()
    const signUpProofEvents = await unirepContract.queryFilter(signUpProofFilter, DEFAULT_START_BLOCK)
    const startTransitionFilter = unirepContract.filters.IndexedStartedTransitionProof()
    const startTransitionfEvents = await unirepContract.queryFilter(startTransitionFilter, DEFAULT_START_BLOCK)
    const processAttestationsFilter = unirepContract.filters.IndexedProcessedAttestationsProof()
    const processAttestationsEvents = await unirepContract.queryFilter(processAttestationsFilter, DEFAULT_START_BLOCK)
    const userStateTransitionFilter = unirepContract.filters.IndexedUserStateTransitionProof()
    const userStateTransitionEvents = await unirepContract.queryFilter(userStateTransitionFilter, DEFAULT_START_BLOCK)

    for (const event of epochKeyProofEvents) {
        await updateDBFromEpochKeyProofEvent(event)
    }

    for (const event of reputationProofEvents) {
        await updateDBFromReputationProofEvent(event)
    }

    for (const event of signUpProofEvents) {
        await updateDBFromUserSignedUpProofEvent(event)
    }

    for (const event of startTransitionfEvents) {
        await updateDBFromStartUSTProofEvent(event)
    }

    for (const event of processAttestationsEvents) {
        await updateDBFromProcessAttestationProofEvent(event)
    }

    for (const event of userStateTransitionEvents) {
        await updateDBFromUSTProofEvent(event)
    }

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
    const signUpEvents =  await unirepSocialContract.queryFilter(signUpFilter, DEFAULT_START_BLOCK)

    const postFilter = unirepSocialContract.filters.PostSubmitted()
    const postEvents =  await unirepSocialContract.queryFilter(postFilter, DEFAULT_START_BLOCK)

    const commentFilter = unirepSocialContract.filters.CommentSubmitted()
    const commentEvents =  await unirepSocialContract.queryFilter(commentFilter, DEFAULT_START_BLOCK)

    const voteFilter = unirepSocialContract.filters.VoteSubmitted()
    const voteEvents =  await unirepSocialContract.queryFilter(voteFilter, DEFAULT_START_BLOCK)

    const airdropFilter = unirepSocialContract.filters.AirdropSubmitted()
    const airdropEvents =  await unirepSocialContract.queryFilter(airdropFilter, DEFAULT_START_BLOCK)

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
    getCurrentEpoch,
    getGSTLeaves,
    updateGSTLeaf,
    getEpochTreeLeaves,
    GSTRootExists,
    epochTreeRootExists,
    nullifierExists,
    duplicatedNullifierExists,
    updateDBFromEpochKeyProofEvent,
    updateDBFromReputationProofEvent,
    updateDBFromUserSignedUpProofEvent,
    updateDBFromStartUSTProofEvent,
    updateDBFromProcessAttestationProofEvent,
    updateDBFromUSTProofEvent,
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