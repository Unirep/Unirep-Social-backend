import mongoose from 'mongoose'
import { ethers } from 'ethers'
import {
    UNIREP,
    UNIREP_SOCIAL,
    DEFAULT_ETH_PROVIDER,
    UNIREP_ABI,
    UNIREP_SOCIAL_ABI,
    DEFAULT_AIRDROPPED_KARMA,
    ActionType,
    titlePostfix,
    titlePrefix,
    DEFAULT_POST_KARMA,
    DEFAULT_COMMENT_KARMA,
    MONGO_URL,
} from '../constants'
import {
    IncrementalMerkleTree,
    hash5,
    hashLeftRight,
    SparseMerkleTree,
    stringifyBigInts,
    unstringifyBigInts,
} from '@unirep/crypto'
import {
    computeEmptyUserStateRoot,
    computeInitUserStateRoot,
    genNewSMT,
    SMT_ONE_LEAF,
} from '@unirep/core'
import {
    Circuit,
    formatProofForSnarkjsVerification,
    verifyProof,
} from '@unirep/circuits'
import {
    GLOBAL_STATE_TREE_DEPTH,
    USER_STATE_TREE_DEPTH,
    EPOCH_TREE_DEPTH,
} from '@unirep/circuits/config'
import {
    getUnirepContract,
    EpochKeyProof,
    ReputationProof,
    SignUpProof,
    UserTransitionProof,
} from '@unirep/contracts'
import { EventEmitter } from 'events'
import Proof from '../models/proof'
import UserSignUp from '../models/userSignUp'
import GSTLeaf from '../models/GSTLeaf'
import GSTRoot from '../models/GSTRoots'
import Nullifier from '../models/nullifiers'
import Attestation from '../models/attestation'
import Epoch from '../models/epoch'
import Record from '../models/record'
import EpkRecord from '../models/epkRecord'
import Post from '../models/post'
import Comment from '../models/comment'
import Vote from '../models/vote'
import BlockNumber from '../models/blockNumber'
import SynchronizerState from '../models/synchronizerState'

const encodeBigIntArray = (arr: BigInt[]): string => {
    return JSON.stringify(stringifyBigInts(arr))
}

const decodeBigIntArray = (input: string): bigint[] => {
    return unstringifyBigInts(JSON.parse(input))
}

interface IAttestation {
    attesterId: BigInt
    posRep: BigInt
    negRep: BigInt
    graffiti: BigInt
    signUp: BigInt
    hash(): BigInt
    toJSON(): string
}

class HAttestation implements IAttestation {
    public attesterId: BigInt
    public posRep: BigInt
    public negRep: BigInt
    public graffiti: BigInt
    public signUp: BigInt

    constructor(
        _attesterId: BigInt,
        _posRep: BigInt,
        _negRep: BigInt,
        _graffiti: BigInt,
        _signUp: BigInt
    ) {
        this.attesterId = _attesterId
        this.posRep = _posRep
        this.negRep = _negRep
        this.graffiti = _graffiti
        this.signUp = _signUp
    }

    public hash = (): BigInt => {
        return hash5([
            this.attesterId,
            this.posRep,
            this.negRep,
            this.graffiti,
            this.signUp,
        ])
    }

    public toJSON = (space = 0): string => {
        return JSON.stringify(
            {
                attesterId: this.attesterId.toString(),
                posRep: this.posRep.toString(),
                negRep: this.negRep.toString(),
                graffiti: this.graffiti.toString(),
                signUp: this.signUp.toString(),
            },
            null,
            space
        )
    }
}

export class Synchronizer extends EventEmitter {
    provider = DEFAULT_ETH_PROVIDER
    unirepSocialContract: ethers.Contract
    unirepContract: ethers.Contract
    public currentEpoch: number = 1
    private epochTreeRoot: { [key: number]: BigInt } = {}
    private GSTLeaves: { [key: number]: BigInt[] } = {}
    private epochTreeLeaves: { [key: number]: any[] } = {}
    private nullifiers: { [key: string]: boolean } = {}
    private globalStateTree: { [key: number]: IncrementalMerkleTree } = {}
    private epochTree: { [key: number]: SparseMerkleTree } = {}
    private defaultGSTLeaf: BigInt
    private userNum: number = 0
    _session: any

    public latestProcessedBlock: number = 0
    private sealedEpochKey: { [key: string]: boolean } = {}
    private epochKeyInEpoch: { [key: number]: Map<string, boolean> } = {}
    private epochKeyToAttestationsMap: { [key: string]: IAttestation[] } = {}
    private epochGSTRootMap: { [key: number]: Map<string, boolean> } = {}

    constructor() {
        super()
        this.unirepSocialContract = new ethers.Contract(
            UNIREP_SOCIAL,
            UNIREP_SOCIAL_ABI,
            DEFAULT_ETH_PROVIDER
        )
        this.unirepContract = new ethers.Contract(
            UNIREP,
            UNIREP_ABI,
            DEFAULT_ETH_PROVIDER
        )
        this.epochKeyInEpoch[this.currentEpoch] = new Map()
        this.epochTreeRoot[this.currentEpoch] = BigInt(0)
        const emptyUserStateRoot = computeEmptyUserStateRoot(
            USER_STATE_TREE_DEPTH
        )
        this.defaultGSTLeaf = hashLeftRight(BigInt(0), emptyUserStateRoot)
        this.GSTLeaves[this.currentEpoch] = []
        this.globalStateTree[this.currentEpoch] = new IncrementalMerkleTree(
            GLOBAL_STATE_TREE_DEPTH,
            this.defaultGSTLeaf,
            2
        )
        this.epochGSTRootMap[this.currentEpoch] = new Map()
    }

    // start sychronizing events
    async start() {
        const state = await SynchronizerState.findOne({})
        if (!state) {
            await SynchronizerState.create({
                latestProcessedBlock: 0,
                latestProcessedTransactionIndex: 0,
                latestProcessedEventIndex: 0,
            })
        }
        this.startDaemon()
    }

    async startDaemon() {
        let latestBlock = await this.provider.getBlockNumber()
        this.provider.on('block', (num) => {
            if (num > latestBlock) latestBlock = num
        })
        let latestProcessed = 0
        await BlockNumber.create({ number: latestProcessed })
        for (;;) {
            if (latestProcessed === latestBlock) {
                await new Promise((r) => setTimeout(r, 1000))
                continue
            }
            const newLatest = latestBlock
            const allEvents = (
                await Promise.all([
                    this.unirepContract.queryFilter(
                        this.unirepFilter,
                        latestProcessed + 1,
                        newLatest
                    ),
                    this.unirepSocialContract.queryFilter(
                        this.unirepSocialFilter,
                        latestProcessed + 1,
                        newLatest
                    ),
                ])
            ).flat() as ethers.Event[]
            const state = await SynchronizerState.findOne({})
            if (!state) throw new Error('State not initialized')
            // first process historical ones then listen
            await this.processEvents(
                allEvents.filter((e) => {
                    if (e.blockNumber === state.latestProcessedBlock) {
                        if (
                            e.transactionIndex ===
                            state.latestProcessedTransactionIndex
                        ) {
                            return e.logIndex > state.latestProcessedEventIndex
                        }
                        return (
                            e.transactionIndex >
                            state.latestProcessedTransactionIndex
                        )
                    }
                    return e.blockNumber > state.latestProcessedBlock
                })
            )
            latestProcessed = newLatest
            await SynchronizerState.updateOne(
                {},
                {
                    latestCompleteBlock: newLatest,
                }
            )
        }
    }

    get allTopics() {
        const [UserSignedUp] = this.unirepContract.filters.UserSignedUp()
            .topics as string[]
        const [UserStateTransitioned] =
            this.unirepContract.filters.UserStateTransitioned()
                .topics as string[]
        const [AttestationSubmitted] =
            this.unirepContract.filters.AttestationSubmitted()
                .topics as string[]
        const [EpochEnded] = this.unirepContract.filters.EpochEnded()
            .topics as string[]
        const [IndexedEpochKeyProof] =
            this.unirepContract.filters.IndexedEpochKeyProof()
                .topics as string[]
        const [IndexedReputationProof] =
            this.unirepContract.filters.IndexedReputationProof()
                .topics as string[]
        const [IndexedUserSignedUpProof] =
            this.unirepContract.filters.IndexedUserSignedUpProof()
                .topics as string[]
        const [IndexedStartedTransitionProof] =
            this.unirepContract.filters.IndexedStartedTransitionProof()
                .topics as string[]
        const [IndexedProcessedAttestationsProof] =
            this.unirepContract.filters.IndexedProcessedAttestationsProof()
                .topics as string[]
        const [IndexedUserStateTransitionProof] =
            this.unirepContract.filters.IndexedUserStateTransitionProof()
                .topics as string[]
        const [_UserSignedUp] = this.unirepSocialContract.filters.UserSignedUp()
            .topics as string[]
        const [_PostSubmitted] =
            this.unirepSocialContract.filters.PostSubmitted().topics as string[]
        const [_CommentSubmitted] =
            this.unirepSocialContract.filters.CommentSubmitted()
                .topics as string[]
        const [_VoteSubmitted] =
            this.unirepSocialContract.filters.VoteSubmitted().topics as string[]
        const [_AirdropSubmitted] =
            this.unirepSocialContract.filters.AirdropSubmitted()
                .topics as string[]
        return {
            UserSignedUp,
            UserStateTransitioned,
            AttestationSubmitted,
            EpochEnded,
            IndexedEpochKeyProof,
            IndexedReputationProof,
            IndexedUserSignedUpProof,
            IndexedStartedTransitionProof,
            IndexedProcessedAttestationsProof,
            IndexedUserStateTransitionProof,
            _UserSignedUp,
            _PostSubmitted,
            _CommentSubmitted,
            _VoteSubmitted,
            _AirdropSubmitted,
        }
    }

    get unirepFilter() {
        const [UserSignedUp] = this.unirepContract.filters.UserSignedUp()
            .topics as string[]
        const [UserStateTransitioned] =
            this.unirepContract.filters.UserStateTransitioned()
                .topics as string[]
        const [AttestationSubmitted] =
            this.unirepContract.filters.AttestationSubmitted()
                .topics as string[]
        const [EpochEnded] = this.unirepContract.filters.EpochEnded()
            .topics as string[]
        const [IndexedEpochKeyProof] =
            this.unirepContract.filters.IndexedEpochKeyProof()
                .topics as string[]
        const [IndexedReputationProof] =
            this.unirepContract.filters.IndexedReputationProof()
                .topics as string[]
        const [IndexedUserSignedUpProof] =
            this.unirepContract.filters.IndexedUserSignedUpProof()
                .topics as string[]
        const [IndexedStartedTransitionProof] =
            this.unirepContract.filters.IndexedStartedTransitionProof()
                .topics as string[]
        const [IndexedProcessedAttestationsProof] =
            this.unirepContract.filters.IndexedProcessedAttestationsProof()
                .topics as string[]
        const [IndexedUserStateTransitionProof] =
            this.unirepContract.filters.IndexedUserStateTransitionProof()
                .topics as string[]

        return {
            address: this.unirepContract.address,
            topics: [
                [
                    UserSignedUp,
                    UserStateTransitioned,
                    AttestationSubmitted,
                    EpochEnded,
                    IndexedEpochKeyProof,
                    IndexedReputationProof,
                    IndexedUserSignedUpProof,
                    IndexedStartedTransitionProof,
                    IndexedProcessedAttestationsProof,
                    IndexedUserStateTransitionProof,
                ],
            ],
        }
    }

    get unirepSocialFilter() {
        const [_UserSignedUp] = this.unirepSocialContract.filters.UserSignedUp()
            .topics as string[]
        const [_PostSubmitted] =
            this.unirepSocialContract.filters.PostSubmitted().topics as string[]
        const [_CommentSubmitted] =
            this.unirepSocialContract.filters.CommentSubmitted()
                .topics as string[]
        const [_VoteSubmitted] =
            this.unirepSocialContract.filters.VoteSubmitted().topics as string[]
        const [_AirdropSubmitted] =
            this.unirepSocialContract.filters.AirdropSubmitted()
                .topics as string[]
        // Unirep Social events
        return {
            address: this.unirepSocialContract.address,
            topics: [
                [
                    _UserSignedUp,
                    _PostSubmitted,
                    _CommentSubmitted,
                    _VoteSubmitted,
                    _AirdropSubmitted,
                ],
            ],
        }
    }

    async processEvents(_events: ethers.Event | ethers.Event[]) {
        const events = [_events].flat()
        if (events.length === 0) return
        events.sort((a: any, b: any) => {
            if (a.blockNumber !== b.blockNumber) {
                return a.blockNumber - b.blockNumber
            }
            if (a.transactionIndex !== b.transactionIndex) {
                return a.transactionIndex - b.transactionIndex
            }
            return a.logIndex - b.logIndex
        })

        const db = mongoose.createConnection(MONGO_URL)
        this._session = await db.startSession()
        for (const event of events) {
            this._session.startTransaction()
            try {
                await this._processEvent(event)
                await SynchronizerState.updateOne(
                    {},
                    {
                        latestProcessedBlock: +event.blockNumber,
                        latestProcessedTransactionIndex:
                            +event.transactionIndex,
                        latestProcessedEventIndex: +event.logIndex,
                    },
                    { session: this._session }
                )
                await this._session.commitTransaction()
            } catch (err) {
                console.log(`Error processing event:`, err)
                console.log(event)
                if (!this._session) break // the commit failed, no need to abort
                await this._session.abortTransaction()
                break
            }
        }
        if (this._session) await this._session.endSession()
        await db.close()
        this._session = undefined
    }

    private async _processEvent(event) {
        // no, i don't know what a switch statement is...
        if (event.topics[0] === this.allTopics.IndexedEpochKeyProof) {
            console.log('IndexedEpochKeyProof')
            await this.epochKeyProofEvent(event)
        } else if (event.topics[0] === this.allTopics.IndexedReputationProof) {
            console.log('IndexedReputationProof')
            await this.reputationProofEvent(event)
        } else if (
            event.topics[0] === this.allTopics.IndexedUserSignedUpProof
        ) {
            console.log('IndexedUserSignedUpProof')
            await this.userSignedUpProofEvent(event)
        } else if (
            event.topics[0] === this.allTopics.IndexedStartedTransitionProof
        ) {
            console.log('IndexedStartedTransitionProof')
            await this.startUSTProofEvent(event)
        } else if (
            event.topics[0] === this.allTopics.IndexedProcessedAttestationsProof
        ) {
            console.log('IndexedProcessedAttestationsProof')
            await this.processAttestationProofEvent(event)
        } else if (
            event.topics[0] === this.allTopics.IndexedUserStateTransitionProof
        ) {
            console.log('IndexedUserStateTransitionProof')
            await this.USTProofEvent(event)
        } else if (event.topics[0] === this.allTopics.UserSignedUp) {
            console.log('UserSignedUp')
            await this.userSignedUpEvent(event)
        } else if (event.topics[0] === this.allTopics.UserStateTransitioned) {
            console.log('UserStateTransitioned')
            await this.USTEvent(event)
        } else if (event.topics[0] === this.allTopics.AttestationSubmitted) {
            console.log('AttestationSubmitted')
            await this.attestationEvent(event)
        } else if (event.topics[0] === this.allTopics.EpochEnded) {
            console.log('EpochEnded')
            await this.epochEndedEvent(event)
        } else if (event.topics[0] === this.allTopics._UserSignedUp) {
            console.log('Social: UserSignedUp')
            const _epoch = Number(event.topics[1])
            const _commitment = BigInt(event.topics[2]).toString()
            await UserSignUp.create(
                [
                    {
                        transactionHash: event.transactionHash,
                        commitment: _commitment,
                        epoch: _epoch,
                    },
                ],
                { session: this._session }
            )
        } else if (event.topics[0] === this.allTopics._PostSubmitted) {
            console.log('Social: PostSubmitted')
            await this.postSubmittedEvent(event)
        } else if (event.topics[0] === this.allTopics._CommentSubmitted) {
            console.log('Social: CommentSubmitted')
            await this.commentSubmittedEvent(event)
        } else if (event.topics[0] === this.allTopics._VoteSubmitted) {
            console.log('Social: VoteSubmitted')
            await this.voteSubmittedEvent(event)
        } else if (event.topics[0] === this.allTopics._AirdropSubmitted) {
            console.log('Social: AirdropSubmitted')
            await this.airdropSubmittedEvent(event)
        } else {
            console.log(event)
            throw new Error(`Unrecognized event topic "${event.topics[0]}"`)
        }
    }

    private async verifyAttestationProof(index: number, _epoch: number) {
        const proof = await Proof.findOne({
            epoch: _epoch,
            index,
        })
        if (!proof) throw new Error(`Unable to find attestation proof ${index}`)
        let formedProof
        if (proof.event === 'IndexedEpochKeyProof') {
            const publicSignals = decodeBigIntArray(proof.publicSignals)
            const _proof = JSON.parse(proof.proof)
            formedProof = new EpochKeyProof(
                publicSignals,
                formatProofForSnarkjsVerification(_proof)
            )
        } else if (proof.event === 'IndexedReputationProof') {
            const publicSignals = decodeBigIntArray(proof.publicSignals)
            const _proof = JSON.parse(proof.proof)
            formedProof = new ReputationProof(
                publicSignals,
                formatProofForSnarkjsVerification(_proof)
            )
        } else if (proof.event === 'IndexedUserSignedUpProof') {
            const publicSignals = decodeBigIntArray(proof.publicSignals)
            const _proof = JSON.parse(proof.proof)
            formedProof = new SignUpProof(
                publicSignals,
                formatProofForSnarkjsVerification(_proof)
            )
        } else {
            console.log(
                `proof index ${index} matches wrong event ${proof.event}`
            )
            return { isProofValid: false, proof: formedProof }
        }
        if (!(await formedProof.verify())) {
            return { isProofValid: false, proof: formedProof }
        }

        const epoch = Number(formedProof.epoch)
        const root = BigInt(formedProof.globalStateTree).toString()
        const rootExists = await GSTRoot.exists({
            epoch,
            root,
        })
        if (!rootExists) {
            console.log('Global state tree root mismatches')
            await Proof.findOneAndUpdate(
                {
                    epoch,
                    index,
                },
                {
                    valid: false,
                },
                { session: this._session }
            )
            return { isProofValid: false, proof: formedProof }
        }
        return { isProofValid: true, proof: formedProof }
    }

    async commentSubmittedEvent(event: ethers.Event) {
        const decodedData = this.unirepSocialContract.interface.decodeEventLog(
            'CommentSubmitted',
            event.data
        )
        const _transactionHash = event.transactionHash
        const commentId = event.transactionHash
        const postId = event.topics[2]
        const _epoch = Number(event.topics[1])
        const _epochKey = BigInt(event.topics[3]).toString(16)
        const _minRep = Number(decodedData.proofRelated.minRep._hex)
        const findComment = await Comment.findOne({
            transactionHash: commentId,
        })

        const reputationProof = decodedData.proofRelated
        const proofNullifier = await this.unirepContract.hashReputationProof(
            reputationProof
        )
        const proofIndex = Number(
            await this.unirepContract.getProofIndex(proofNullifier)
        )

        const findValidProof = await Proof.findOne({
            index: proofIndex,
            epoch: _epoch,
        })
        if (!findValidProof) {
            throw new Error('unable to find proof for comment')
        }
        if (findValidProof.valid === false) {
            console.log(`proof index ${proofIndex} is invalid`)
            return
        }
        {
            const { isProofValid } = await this.verifyAttestationProof(
                proofIndex,
                _epoch
            )
            if (isProofValid === false) {
                console.log(`proof index ${proofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await Nullifier.exists({
            nullifier: {
                $in: repNullifiers,
            },
            confirmed: true,
        })
        if (existingNullifier) {
            console.log(`comment duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        await Nullifier.deleteMany(
            {
                nullfier: {
                    $in: repNullifiers,
                },
                confirmed: false,
            },
            { session: this._session }
        )
        await Nullifier.insertMany(
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            })),
            { session: this._session }
        )

        if (findComment) {
            findComment?.set('status', 1, {
                new: true,
                upsert: false,
                session: this._session,
            })
            findComment?.set('transactionHash', _transactionHash, {
                new: true,
                upsert: false,
                session: this._session,
            })
            findComment?.set('proofIndex', proofIndex, {
                new: true,
                upsert: false,
                session: this._session,
            })
            await findComment?.save({ session: this._session })
        } else {
            const newComment = new Comment({
                transactionHash: _transactionHash,
                postId,
                content: decodedData?.commentContent, // TODO: hashedContent
                epochKey: _epochKey,
                proofIndex: proofIndex,
                epoch: _epoch,
                proveMinRep: _minRep !== 0 ? true : false,
                minRep: _minRep,
                posRep: 0,
                negRep: 0,
                status: 1,
            })
            newComment.set({ new: true, upsert: false, session: this._session })

            await newComment.save({ session: this._session })
        }
        await Post.updateOne(
            {
                transactionHash: postId,
            },
            {
                $inc: {
                    commentCount: 1,
                },
            }
        )

        await Record.deleteMany(
            {
                transactionHash: _transactionHash,
                confirmed: false,
            },
            { session: this._session }
        )

        await Record.create(
            [
                {
                    to: _epochKey,
                    from: _epochKey,
                    upvote: 0,
                    downvote: DEFAULT_COMMENT_KARMA,
                    epoch: _epoch,
                    action: ActionType.Comment,
                    data: _transactionHash,
                    transactionHash: _transactionHash,
                },
            ],
            { session: this._session }
        )
        await EpkRecord.findOneAndUpdate(
            {
                epk: _epochKey,
                epoch: _epoch,
            },
            {
                $inc: {
                    posRep: 0,
                    negRep: 0,
                    spent: DEFAULT_COMMENT_KARMA,
                },
            },
            { new: true, upsert: true, session: this._session }
        )
    }

    async postSubmittedEvent(event: ethers.Event) {
        const postId = event.transactionHash
        const findPost = await Post.findOne({ transactionHash: postId })

        const decodedData = this.unirepSocialContract.interface.decodeEventLog(
            'PostSubmitted',
            event.data
        )
        const reputationProof = decodedData.proofRelated
        const proofNullifier = await this.unirepContract.hashReputationProof(
            reputationProof
        )
        const proofIndex = Number(
            await this.unirepContract.getProofIndex(proofNullifier)
        )

        const _transactionHash = event.transactionHash
        const _epoch = Number(event.topics[1])
        const _epochKey = BigInt(event.topics[2]).toString(16)
        const _minRep = Number(decodedData.proofRelated.minRep._hex)

        const findValidProof = await Proof.findOne({
            index: proofIndex,
            epoch: _epoch,
        })
        if (!findValidProof) {
            throw new Error('unable to find proof for post')
        }
        if (findValidProof.valid === false) {
            console.log(`proof index ${proofIndex} is invalid`)
            return
        }
        {
            const { isProofValid } = await this.verifyAttestationProof(
                proofIndex,
                _epoch
            )
            if (isProofValid === false) {
                console.log(`proof index ${proofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await Nullifier.exists({
            nullifier: {
                $in: repNullifiers,
            },
            confirmed: true,
        })
        if (existingNullifier) {
            console.log(`post duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        await Nullifier.deleteMany(
            {
                nullfier: {
                    $in: repNullifiers,
                },
                confirmed: false,
            },
            { session: this._session }
        )
        await Nullifier.insertMany(
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            })),
            { session: this._session }
        )

        if (findPost) {
            findPost?.set('status', 1, {
                new: true,
                upsert: false,
                session: this._session,
            })
            findPost?.set('transactionHash', _transactionHash, {
                new: true,
                upsert: false,
                session: this._session,
            })
            findPost?.set('proofIndex', proofIndex, {
                new: true,
                upsert: false,
                session: this._session,
            })
            await findPost?.save({ session: this._session })
        } else {
            let content: string = ''
            let title: string = ''
            if (decodedData !== null) {
                let i: number = decodedData.postContent.indexOf(titlePrefix)
                if (i === -1) {
                    content = decodedData.postContent
                } else {
                    i = i + titlePrefix.length
                    let j: number = decodedData.postContent.indexOf(
                        titlePostfix,
                        i + 1
                    )
                    if (j === -1) {
                        content = decodedData.postContent
                    } else {
                        title = decodedData.postContent.substring(i, j)
                        content = decodedData.postContent.substring(
                            j + titlePostfix.length
                        )
                    }
                }
            }
            const newpost = new Post({
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
                status: 1,
            })
            newpost.set({ new: true, upsert: false, session: this._session })
            await newpost.save({ session: this._session })
        }
        await Record.deleteMany(
            {
                transactionHash: _transactionHash,
                confirmed: false,
            },
            { session: this._session }
        )
        await Record.create(
            [
                {
                    to: _epochKey,
                    from: _epochKey,
                    upvote: 0,
                    downvote: DEFAULT_POST_KARMA,
                    epoch: _epoch,
                    action: ActionType.Post,
                    data: _transactionHash,
                    transactionHash: _transactionHash,
                },
            ],
            { session: this._session }
        )
        await EpkRecord.findOneAndUpdate(
            {
                epk: _epochKey,
                epoch: _epoch,
            },
            {
                $inc: {
                    posRep: 0,
                    negRep: 0,
                    spent: DEFAULT_POST_KARMA,
                },
            },
            { new: true, upsert: true, session: this._session }
        )
    }

    async voteSubmittedEvent(event: ethers.Event) {
        const voteId = event.transactionHash

        const decodedData = this.unirepSocialContract.interface.decodeEventLog(
            'VoteSubmitted',
            event.data
        )
        const _transactionHash = event.transactionHash
        const _epoch = Number(event.topics[1])
        const _fromEpochKey = BigInt(event.topics[2]).toString(16)
        const _toEpochKey = BigInt(event.topics[3]).toString(16)
        const _toEpochKeyProofIndex = Number(
            decodedData.toEpochKeyProofIndex._hex
        )

        const _posRep = Number(decodedData.upvoteValue._hex)
        const _negRep = Number(decodedData.downvoteValue._hex)

        const reputationProof = decodedData.proofRelated
        const proofNullifier = await this.unirepContract.hashReputationProof(
            reputationProof
        )
        const fromProofIndex = Number(
            await this.unirepContract.getProofIndex(proofNullifier)
        )

        const proof = await Proof.findOne({
            index: _toEpochKeyProofIndex,
            epoch: _epoch,
        })
        if (!proof) {
            throw new Error('Unable to find proof for vote')
        }
        if (proof.valid === false) {
            console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
            return
        }
        {
            const { isProofValid } = await this.verifyAttestationProof(
                _toEpochKeyProofIndex,
                _epoch
            )
            if (isProofValid === false) {
                console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
                return
            }
        }

        const fromValidProof = await Proof.findOne({
            epoch: _epoch,
            index: fromProofIndex,
        })
        if (!fromValidProof) {
            throw new Error('Unable to find from valid proof vote')
        }
        if (fromValidProof.valid === false) {
            console.log(`proof index ${fromProofIndex} is invalid`)
            return
        }
        {
            const { isProofValid } = await this.verifyAttestationProof(
                fromProofIndex,
                _epoch
            )
            if (isProofValid === false) {
                console.log(`proof index ${fromProofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await Nullifier.exists({
            nullifier: {
                $in: repNullifiers,
            },
            confirmed: true,
        })
        if (existingNullifier) {
            console.log(`vote duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        await Nullifier.deleteMany(
            {
                nullfier: {
                    $in: repNullifiers,
                },
                confirmed: false,
            },
            { session: this._session }
        )
        await Nullifier.insertMany(
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            })),
            { session: this._session }
        )
        const findVote = await Vote.findOne({ transactionHash: voteId })
        if (findVote) {
            findVote?.set('status', 1, {
                new: true,
                upsert: false,
                session: this._session,
            })
            findVote?.set('transactionHash', _transactionHash, {
                new: true,
                upsert: false,
                session: this._session,
            })
            await findVote?.save({ session: this._session })
            if (findVote.postId) {
                await Post.updateOne(
                    {
                        transactionHash: findVote.postId,
                    },
                    {
                        $inc: {
                            posRep: findVote.posRep,
                            negRep: findVote.negRep,
                            totalRep: findVote.negRep + findVote.posRep,
                        },
                    }
                )
            } else if (findVote.commentId) {
                await Comment.updateOne(
                    {
                        transactionHash: findVote.commentId,
                    },
                    {
                        $inc: {
                            posRep: findVote.posRep,
                            negRep: findVote.negRep,
                            totalRep: findVote.negRep + findVote.posRep,
                        },
                    }
                )
            }
        } else {
            const newVote = new Vote({
                transactionHash: _transactionHash,
                epoch: _epoch,
                voter: _fromEpochKey,
                receiver: _toEpochKey,
                posRep: _posRep,
                negRep: _negRep,
                graffiti: '0',
                overwriteGraffiti: false,
                postId: '',
                commentId: '',
                status: 1,
            })
            newVote.set({ new: true, upsert: false, session: this._session })
            await newVote.save({ session: this._session })
        }

        await Record.deleteMany(
            {
                transactionHash: _transactionHash,
                confirmed: false,
            },
            { session: this._session }
        )
        await Record.create(
            [
                {
                    to: _toEpochKey,
                    from: _fromEpochKey,
                    upvote: _posRep,
                    downvote: _negRep,
                    epoch: _epoch,
                    action: ActionType.Vote,
                    transactionHash: _transactionHash,
                    data: '',
                },
            ],
            { session: this._session }
        )
        await EpkRecord.findOneAndUpdate(
            {
                epk: _fromEpochKey,
                epoch: _epoch,
            },
            {
                $inc: {
                    posRep: 0,
                    negRep: 0,
                    spent: _posRep + _negRep,
                },
            },
            { new: true, upsert: true, session: this._session }
        )

        await EpkRecord.findOneAndUpdate(
            {
                epk: _toEpochKey,
                epoch: _epoch,
            },
            {
                $inc: {
                    posRep: _posRep,
                    negRep: _negRep,
                },
            },
            { new: true, upsert: true, session: this._session }
        )
    }

    async airdropSubmittedEvent(event: ethers.Event) {
        const decodedData = this.unirepSocialContract.interface.decodeEventLog(
            'AirdropSubmitted',
            event.data
        )
        const _transactionHash = event.transactionHash
        const _epoch = Number(event.topics[1])
        const _epochKey = BigInt(event.topics[2]).toString(16)
        const signUpProof = decodedData.proofRelated

        const unirepContract = getUnirepContract(UNIREP, DEFAULT_ETH_PROVIDER)

        const proofNullifier = await this.unirepContract.hashSignUpProof(
            signUpProof
        )
        const proofIndex = Number(
            await unirepContract.getProofIndex(proofNullifier)
        )

        const proof = await Proof.findOne({
            epoch: _epoch,
            index: proofIndex,
        })
        if (!proof) throw new Error('Unable to find airdrop proof')
        const { isProofValid } = await this.verifyAttestationProof(
            proofIndex,
            _epoch
        )
        if (isProofValid === false) return

        await Record.deleteMany(
            {
                transactionHash: _transactionHash,
                confirmed: false,
            },
            { session: this._session }
        )
        await Record.create(
            [
                {
                    to: _epochKey,
                    from: 'UnirepSocial',
                    upvote: DEFAULT_AIRDROPPED_KARMA,
                    downvote: 0,
                    epoch: _epoch,
                    action: 'UST',
                    data: '0',
                    transactionHash: event.transactionHash,
                },
            ],
            { session: this._session }
        )
    }

    async epochEndedEvent(event: ethers.Event) {
        console.log('update db from epoch ended event: ')
        // console.log(event);
        // update Unirep state
        const epoch = Number(event?.topics[1])
        this.epochTree[epoch] = await genNewSMT(EPOCH_TREE_DEPTH, SMT_ONE_LEAF)
        const epochTreeLeaves = [] as any[]

        // seal all epoch keys in current epoch
        for (const epochKey of this.epochKeyInEpoch[epoch]?.keys() || []) {
            // this._checkEpochKeyRange(epochKey)
            // this._isEpochKeySealed(epochKey)

            let hashChain: BigInt = BigInt(0)
            for (
                let i = 0;
                i < this.epochKeyToAttestationsMap[epochKey].length;
                i++
            ) {
                hashChain = hashLeftRight(
                    this.epochKeyToAttestationsMap[epochKey][i].hash(),
                    hashChain
                )
            }
            const sealedHashChainResult = hashLeftRight(BigInt(1), hashChain)
            const epochTreeLeaf = {
                epochKey: BigInt('0x' + epochKey),
                hashchainResult: sealedHashChainResult,
            }
            epochTreeLeaves.push(epochTreeLeaf)
            this.sealedEpochKey[epochKey] = true
        }

        // Add to epoch key hash chain map
        for (let leaf of epochTreeLeaves) {
            await this.epochTree[epoch].update(
                leaf.epochKey,
                leaf.hashchainResult
            )
        }
        this.epochTreeLeaves[epoch] = epochTreeLeaves.slice()
        this.epochTreeRoot[epoch] = this.epochTree[epoch].getRootHash()
        this.currentEpoch++
        this.GSTLeaves[this.currentEpoch] = []
        this.epochKeyInEpoch[this.currentEpoch] = new Map()
        this.globalStateTree[this.currentEpoch] = new IncrementalMerkleTree(
            GLOBAL_STATE_TREE_DEPTH,
            this.defaultGSTLeaf,
            2
        )
        this.epochGSTRootMap[this.currentEpoch] = new Map()
        await Epoch.findOneAndUpdate(
            {
                number: epoch,
            },
            {
                number: epoch,
                sealed: true,
                epochRoot: this.epochTree[epoch].getRootHash().toString(),
            },
            {
                upsert: true,
                session: this._session,
            }
        )
    }

    async attestationEvent(event: ethers.Event) {
        const _epoch = Number(event.topics[1])
        const _epochKey = BigInt(event.topics[2])
        const _attester = event.topics[3]
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'AttestationSubmitted',
            event.data
        )
        const toProofIndex = Number(decodedData.toProofIndex)
        const fromProofIndex = Number(decodedData.fromProofIndex)
        // const attestIndex = Number(decodedData.attestIndex)
        // {
        //     const existing = await Attestation.exists({
        //         index: attestIndex,
        //     })
        //     if (existing) return
        // }
        const attestation = new HAttestation(
            BigInt(decodedData.attestation.attesterId),
            BigInt(decodedData.attestation.posRep),
            BigInt(decodedData.attestation.negRep),
            BigInt(decodedData.attestation.graffiti._hex),
            BigInt(decodedData.attestation.signUp)
        )
        await Attestation.create(
            [
                {
                    epoch: _epoch,
                    epochKey: _epochKey.toString(16),
                    // index: attestIndex,
                    transactionHash: event.transactionHash,
                    attester: _attester,
                    proofIndex: toProofIndex,
                    attesterId: Number(decodedData.attestation.attesterId),
                    posRep: Number(decodedData.attestation.posRep),
                    negRep: Number(decodedData.attestation.negRep),
                    graffiti: decodedData.attestation.graffiti._hex,
                    signUp: Boolean(Number(decodedData.attestation?.signUp)),
                    hash: attestation.hash().toString(),
                },
            ],
            { session: this._session }
        )

        const validProof = await Proof.findOne({
            epoch: _epoch,
            index: toProofIndex,
        })
        if (!validProof) {
            throw new Error('Unable to find proof for attestation')
        }
        if (validProof.valid === false) {
            await Attestation.findOneAndUpdate(
                {
                    epoch: _epoch,
                    epochKey: _epochKey.toString(16),
                    // index: attestIndex,
                },
                {
                    valid: false,
                },
                { session: this._session }
            )
            return
        }
        if (fromProofIndex) {
            const fromValidProof = await Proof.findOne({
                epoch: _epoch,
                index: fromProofIndex,
            })
            if (!fromValidProof) {
                throw new Error('Unable to find from proof')
            }
            if (fromValidProof.valid === false || fromValidProof.spent) {
                await Attestation.findOneAndUpdate(
                    {
                        epoch: _epoch,
                        epochKey: _epochKey.toString(16),
                        // index: attestIndex,
                    },
                    {
                        valid: false,
                    },
                    { session: this._session }
                )
                return
            }
            await Proof.findOneAndUpdate(
                {
                    epoch: _epoch,
                    index: fromProofIndex,
                },
                {
                    spent: true,
                },
                { session: this._session }
            )
        }
        await Attestation.findOneAndUpdate(
            {
                epoch: _epoch,
                epochKey: _epochKey.toString(16),
                // index: attestIndex,
            },
            {
                valid: true,
            },
            { session: this._session }
        )
        const epochKey = _epochKey.toString(16)
        const attestations = this.epochKeyToAttestationsMap[epochKey]
        if (!attestations) this.epochKeyToAttestationsMap[epochKey] = []
        this.epochKeyToAttestationsMap[epochKey].push(attestation)
        this.epochKeyInEpoch[_epoch].set(epochKey, true)
    }

    async USTEvent(event: ethers.Event) {
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'UserStateTransitioned',
            event.data
        )

        const transactionHash = event.transactionHash
        const epoch = Number(event.topics[1])
        const leaf = BigInt(event.topics[2])
        const proofIndex = Number(decodedData.proofIndex)

        // verify the transition
        const transitionProof = await Proof.findOne({
            index: proofIndex,
            event: 'IndexedUserStateTransitionProof',
        })
        if (!transitionProof) {
            throw new Error('No transition proof found')
        }
        if (
            !transitionProof.valid ||
            transitionProof.event !== 'IndexedUserStateTransitionProof'
        ) {
            console.log('Transition proof is not valid')
            return
        }
        const startTransitionProof = await Proof.findOne({
            event: 'IndexedStartedTransitionProof',
            index: transitionProof.proofIndexRecords[0],
        })
        if (!startTransitionProof.valid) {
            console.log(
                'Start transition proof is not valid',
                startTransitionProof.proofIndexRecords[0]
            )
            return
        }
        const { proofIndexRecords } = transitionProof
        if (
            startTransitionProof.blindedUserState !==
                transitionProof.blindedUserState ||
            startTransitionProof.globalStateTree !==
                transitionProof.globalStateTree
        ) {
            console.log(
                'Start Transition Proof index: ',
                proofIndexRecords[0],
                ' mismatch UST proof'
            )
            return
        }

        // otherwise process attestation proofs
        let currentBlindedUserState = startTransitionProof.blindedUserState
        for (let i = 1; i < proofIndexRecords.length; i++) {
            const processAttestationsProof = await Proof.findOne({
                event: 'IndexedProcessedAttestationsProof',
                index: Number(proofIndexRecords[i]),
            })
            if (!processAttestationsProof) {
                return
            }
            if (!processAttestationsProof.valid) {
                console.log(
                    'Process Attestations Proof index: ',
                    proofIndexRecords[i],
                    ' is invalid'
                )
                return
            }
            if (
                currentBlindedUserState !==
                processAttestationsProof.inputBlindedUserState
            ) {
                console.log(
                    'Process Attestations Proof index: ',
                    proofIndexRecords[i],
                    ' mismatch UST proof'
                )
                return
            }
            currentBlindedUserState =
                processAttestationsProof.outputBlindedUserState
        }
        // verify blinded hash chain result
        const { publicSignals, proof } = transitionProof
        const publicSignals_ = decodeBigIntArray(publicSignals)
        const proof_ = JSON.parse(proof)
        const formatProof = new UserTransitionProof(
            publicSignals_,
            formatProofForSnarkjsVerification(proof_)
        )
        for (const blindedHC of formatProof.blindedHashChains) {
            const query = {
                $and: [
                    {
                        outputBlindedHashChain: blindedHC.toString(),
                        event: {
                            $in: [
                                'IndexedStartedTransitionProof',
                                'IndexedProcessedAttestationsProof',
                            ],
                        },
                    },
                    {
                        $or: proofIndexRecords.map((index) => ({
                            index,
                        })),
                    },
                ],
            }
            const findBlindHC = await Proof.findOne(query)
            const inList = proofIndexRecords.indexOf(findBlindHC.index)
            if (inList === -1) {
                console.log(
                    'Proof in UST mismatches proof in process attestations'
                )
                return
            }
        }

        // save epoch key nullifiers
        // check if GST root, epoch tree root exists
        const fromEpoch = Number(formatProof.transitionFromEpoch)
        const gstRoot = formatProof.fromGlobalStateTree.toString()
        const epochTreeRoot = formatProof.fromEpochTree.toString()
        const epkNullifiers = formatProof.epkNullifiers
            .map((n) => n.toString())
            .filter((n) => n !== '0')
        {
            const existingRoot = await GSTRoot.exists({
                epoch: fromEpoch,
                root: gstRoot,
            })
            if (!existingRoot) {
                console.log('Global state tree root mismatches')
                return
            }
        }
        {
            const existingRoot = await Epoch.exists({
                number: fromEpoch,
                epochRoot: epochTreeRoot,
            })
            if (!existingRoot) {
                console.log('Epoch tree root mismatches')
                return
            }
        }

        // check and save nullifiers
        const existingNullifier = await Nullifier.exists({
            nullifier: {
                $in: epkNullifiers,
            },
            confirmed: true,
        })
        if (existingNullifier) {
            console.log(`duplicated nullifier`)
            return
        }
        // everything checks out, lets start mutating the db
        await Nullifier.deleteMany(
            {
                nullfier: {
                    $in: epkNullifiers,
                },
                confirmed: false,
            },
            { session: this._session }
        )
        await Nullifier.insertMany(
            epkNullifiers.map((nullifier) => ({
                epoch,
                nullifier,
            })),
            { session: this._session }
        )

        this.GSTLeaves[epoch].push(leaf)

        // update GST when new leaf is inserted
        // keep track of each GST root when verifying proofs
        this.globalStateTree[epoch].insert(leaf)
        this.epochGSTRootMap[epoch].set(
            this.globalStateTree[epoch].root.toString(),
            true
        )

        const leafIndexInEpoch = await GSTLeaf.count({
            epoch,
        })
        await GSTLeaf.create(
            [
                {
                    epoch,
                    transactionHash,
                    hash: leaf.toString(),
                    index: leafIndexInEpoch,
                },
            ],
            { session: this._session }
        )
        await GSTRoot.create(
            [
                {
                    epoch,
                    root: this.globalStateTree[epoch].root.toString(),
                },
            ],
            { session: this._session }
        )
    }

    async userSignedUpEvent(event: ethers.Event) {
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'UserSignedUp',
            event.data
        )

        const transactionHash = event.transactionHash
        const epoch = Number(event.topics[1])
        const idCommitment = BigInt(event.topics[2])
        const attesterId = Number(decodedData.attesterId)
        const airdrop = Number(decodedData.airdropAmount)

        const USTRoot = await computeInitUserStateRoot(
            USER_STATE_TREE_DEPTH,
            attesterId,
            airdrop
        )
        const newGSTLeaf = hashLeftRight(idCommitment, USTRoot)
        this.GSTLeaves[epoch].push(newGSTLeaf)

        // update GST when new leaf is inserted
        // keep track of each GST root when verifying proofs
        this.globalStateTree[epoch].insert(newGSTLeaf)
        this.epochGSTRootMap[epoch].set(
            this.globalStateTree[epoch].root.toString(),
            true
        )

        // save the new leaf
        const leafIndexInEpoch = await GSTLeaf.count({
            epoch,
        })
        await GSTLeaf.create(
            [
                {
                    epoch,
                    transactionHash,
                    hash: newGSTLeaf.toString(),
                    index: leafIndexInEpoch,
                },
            ],
            { session: this._session }
        )
        await GSTRoot.create(
            [
                {
                    epoch,
                    root: this.globalStateTree[epoch].root.toString(),
                },
            ],
            { session: this._session }
        )
    }

    async USTProofEvent(event: ethers.Event) {
        const _proofIndex = Number(event.topics[1])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedUserStateTransitionProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const args = decodedData.proof
        const proofIndexRecords = decodedData.proofIndexRecords.map((n) =>
            Number(n)
        )

        const emptyArray = []
        const formatPublicSignals = emptyArray
            .concat(
                args.newGlobalStateTreeLeaf,
                args.epkNullifiers,
                args.transitionFromEpoch,
                args.blindedUserStates,
                args.fromGlobalStateTree,
                args.blindedHashChains,
                args.fromEpochTree
            )
            .map((n) => BigInt(n))
        const formattedProof = args.proof.map((n) => BigInt(n))
        const proof = encodeBigIntArray(formattedProof)
        const publicSignals = encodeBigIntArray(formatPublicSignals)
        const isValid = await verifyProof(
            Circuit.userStateTransition,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    proof: proof,
                    publicSignals: publicSignals,
                    blindedUserState: args.blindedUserStates[0],
                    globalStateTree: args.fromGlobalStateTree,
                    proofIndexRecords: proofIndexRecords,
                    transactionHash: event.transactionHash,
                    event: 'IndexedUserStateTransitionProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }

    async processAttestationProofEvent(event: ethers.Event) {
        const _proofIndex = Number(event.topics[1])
        const _inputBlindedUserState = BigInt(event.topics[2])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedProcessedAttestationsProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const _outputBlindedUserState = BigInt(
            decodedData.outputBlindedUserState
        )
        const _outputBlindedHashChain = BigInt(
            decodedData.outputBlindedHashChain
        )

        const formatPublicSignals = [
            _outputBlindedUserState,
            _outputBlindedHashChain,
            _inputBlindedUserState,
        ]
        const formattedProof = decodedData.proof.map((n) => BigInt(n))
        const isValid = await verifyProof(
            Circuit.processAttestations,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        const proof = encodeBigIntArray(formattedProof)

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    outputBlindedUserState: _outputBlindedUserState.toString(),
                    outputBlindedHashChain: _outputBlindedHashChain.toString(),
                    inputBlindedUserState: _inputBlindedUserState.toString(),
                    proof: proof,
                    transactionHash: event.transactionHash,
                    event: 'IndexedProcessedAttestationsProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }

    async startUSTProofEvent(event: ethers.Event) {
        const _proofIndex = Number(event.topics[1])
        const _blindedUserState = BigInt(event.topics[2])
        const _globalStateTree = BigInt(event.topics[3])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedStartedTransitionProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const _blindedHashChain = BigInt(decodedData.blindedHashChain)
        const formatPublicSignals = [
            _blindedUserState,
            _blindedHashChain,
            _globalStateTree,
        ]
        const formattedProof = decodedData.proof.map((n) => BigInt(n))
        const isValid = await verifyProof(
            Circuit.startTransition,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        const proof = encodeBigIntArray(formattedProof)

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    blindedUserState: _blindedUserState.toString(),
                    blindedHashChain: _blindedHashChain.toString(),
                    globalStateTree: _globalStateTree.toString(),
                    proof: proof,
                    transactionHash: event.transactionHash,
                    event: 'IndexedStartedTransitionProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }

    async userSignedUpProofEvent(event: ethers.Event) {
        const iface = new ethers.utils.Interface(UNIREP_ABI)
        const _proofIndex = Number(event.topics[1])
        const _epoch = Number(event.topics[2])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedUserSignedUpProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const args = decodedData.proof

        const emptyArray = []
        const formatPublicSignals = emptyArray
            .concat(
                args.epoch,
                args.epochKey,
                args.globalStateTree,
                args.attesterId,
                args.userHasSignedUp
            )
            .map((n) => BigInt(n))
        const formattedProof = args.proof.map((n) => BigInt(n))
        const proof = encodeBigIntArray(formattedProof)
        const publicSignals = encodeBigIntArray(formatPublicSignals)
        const isValid = await verifyProof(
            Circuit.proveUserSignUp,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    epoch: _epoch,
                    proof: proof,
                    publicSignals: publicSignals,
                    transactionHash: event.transactionHash,
                    event: 'IndexedUserSignedUpProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }

    async reputationProofEvent(event: ethers.Event) {
        const _proofIndex = Number(event.topics[1])
        const _epoch = Number(event.topics[2])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedReputationProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const args = decodedData.proof
        const emptyArray = []
        const formatPublicSignals = emptyArray
            .concat(
                args.repNullifiers,
                args.epoch,
                args.epochKey,
                args.globalStateTree,
                args.attesterId,
                args.proveReputationAmount,
                args.minRep,
                args.proveGraffiti,
                args.graffitiPreImage
            )
            .map((n) => BigInt(n))
        const formattedProof = args.proof.map((n) => BigInt(n))
        const proof = encodeBigIntArray(formattedProof)
        const publicSignals = encodeBigIntArray(formatPublicSignals)
        const isValid = await verifyProof(
            Circuit.proveReputation,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    epoch: _epoch,
                    proof: proof,
                    publicSignals: publicSignals,
                    transactionHash: event.transactionHash,
                    event: 'IndexedReputationProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }

    async epochKeyProofEvent(event: ethers.Event) {
        const _proofIndex = Number(event.topics[1])
        const _epoch = Number(event.topics[2])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedEpochKeyProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const args = decodedData.proof

        const emptyArray = []
        const formatPublicSignals = emptyArray
            .concat(args.globalStateTree, args.epoch, args.epochKey)
            .map((n) => BigInt(n))
        const formattedProof = args.proof.map((n) => BigInt(n))
        const proof = encodeBigIntArray(formattedProof)
        const publicSignals = encodeBigIntArray(formatPublicSignals)
        const isValid = await verifyProof(
            Circuit.verifyEpochKey,
            formatProofForSnarkjsVerification(formattedProof),
            formatPublicSignals
        )

        await Proof.create(
            [
                {
                    index: _proofIndex,
                    epoch: _epoch,
                    proof: proof,
                    publicSignals: publicSignals,
                    transactionHash: event.transactionHash,
                    event: 'IndexedEpochKeyProof',
                    valid: isValid,
                },
            ],
            { session: this._session }
        )
    }
}

export default new Synchronizer()
