import { EventEmitter } from 'events'
import { DB, TransactionDB } from 'anondb'
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
} from '../constants'
import {
    getUnirepContract,
    EpochKeyProof,
    ReputationProof,
    SignUpProof,
    UserTransitionProof,
} from '@unirep/contracts'
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
    IncrementalMerkleTree,
    hash5,
    hashLeftRight,
    SparseMerkleTree,
    stringifyBigInts,
    unstringifyBigInts,
} from '@unirep/crypto'

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
    private _db: DB
    provider = DEFAULT_ETH_PROVIDER
    unirepSocialContract: ethers.Contract
    unirepContract: ethers.Contract
    public currentEpoch: number = 1
    private epochTreeRoot: { [key: number]: BigInt } = {}
    private GSTLeaves: { [key: number]: BigInt[] } = {}
    private epochTreeLeaves: { [key: number]: any[] } = {}
    private globalStateTree: { [key: number]: IncrementalMerkleTree } = {}
    private epochTree: { [key: number]: SparseMerkleTree } = {}
    private defaultGSTLeaf: BigInt = BigInt(0)
    public latestProcessedBlock: number = 0
    private sealedEpochKey: { [key: string]: boolean } = {}
    private epochKeyInEpoch: { [key: number]: Map<string, boolean> } = {}
    private epochKeyToAttestationsMap: { [key: string]: IAttestation[] } = {}
    private epochGSTRootMap: { [key: number]: Map<string, boolean> } = {}

    constructor(db: DB) {
        super()
        this._db = db
        this.unirepContract = new ethers.Contract(
            UNIREP,
            UNIREP_ABI,
            DEFAULT_ETH_PROVIDER
        )
        this.unirepSocialContract = new ethers.Contract(
            UNIREP_SOCIAL,
            UNIREP_SOCIAL_ABI,
            DEFAULT_ETH_PROVIDER
        )
    }

    async setup() {
        const treeDepths = await this.unirepContract.treeDepths()
        console.log(treeDepths)
        this.epochKeyInEpoch[this.currentEpoch] = new Map()
        this.epochTreeRoot[this.currentEpoch] = BigInt(0)
        const emptyUserStateRoot = computeEmptyUserStateRoot(
            treeDepths.userStateTreeDepth
        )
        this.defaultGSTLeaf = hashLeftRight(BigInt(0), emptyUserStateRoot)
        this.GSTLeaves[this.currentEpoch] = []
        this.globalStateTree[this.currentEpoch] = new IncrementalMerkleTree(
            treeDepths.globalStateTreeDepth,
            this.defaultGSTLeaf,
            2
        )
        this.epochGSTRootMap[this.currentEpoch] = new Map()
    }

    async start() {
        await this.setup()
        const state = await this._db.findOne('SynchronizerState', {
            where: {},
        })
        if (!state) {
            await this._db.create('SynchronizerState', {
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
        // TODO: remove this
        // await this._db.create('BlockNumber', {
        //     number: latestProcessed,
        // })
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
            const state = await this._db.findOne('SynchronizerState', {
                where: {},
            })
            if (!state) throw new Error('State not initialized')
            // first process historical ones then listen
            const unprocessedEvents = allEvents.filter((e) => {
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
            this.processEvents(unprocessedEvents)
            latestProcessed = newLatest
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

    async processEvents(events: ethers.Event[]) {
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

        for (const event of events) {
            try {
                await this._db.transaction(async (db) => {
                    await this._processEvent(event, db)
                    db.update('SynchronizerState', {
                        where: {},
                        update: {
                            latestProcessedBlock: +event.blockNumber,
                            latestProcessedTransactionIndex:
                                +event.transactionIndex,
                            latestProcessedEventIndex: +event.logIndex,
                        },
                    })
                })
            } catch (err) {
                console.log(`Error processing event:`, err)
                console.log(event)
                throw err
            }
        }
    }

    private async _processEvent(event, db: TransactionDB) {
        // no, i don't know what a switch statement is...
        if (event.topics[0] === this.allTopics.IndexedEpochKeyProof) {
            console.log('IndexedEpochKeyProof')
            await this.epochKeyProofEvent(event, db)
        } else if (event.topics[0] === this.allTopics.IndexedReputationProof) {
            console.log('IndexedReputationProof')
            await this.reputationProofEvent(event, db)
        } else if (
            event.topics[0] === this.allTopics.IndexedUserSignedUpProof
        ) {
            console.log('IndexedUserSignedUpProof')
            await this.userSignedUpProofEvent(event, db)
        } else if (
            event.topics[0] === this.allTopics.IndexedStartedTransitionProof
        ) {
            console.log('IndexedStartedTransitionProof')
            await this.startUSTProofEvent(event, db)
        } else if (
            event.topics[0] === this.allTopics.IndexedProcessedAttestationsProof
        ) {
            console.log('IndexedProcessedAttestationsProof')
            await this.processAttestationProofEvent(event, db)
        } else if (
            event.topics[0] === this.allTopics.IndexedUserStateTransitionProof
        ) {
            console.log('IndexedUserStateTransitionProof')
            await this.USTProofEvent(event, db)
        } else if (event.topics[0] === this.allTopics.UserSignedUp) {
            console.log('UserSignedUp')
            await this.userSignedUpEvent(event, db)
        } else if (event.topics[0] === this.allTopics.UserStateTransitioned) {
            console.log('UserStateTransitioned')
            await this.USTEvent(event, db)
        } else if (event.topics[0] === this.allTopics.AttestationSubmitted) {
            console.log('AttestationSubmitted')
            await this.attestationEvent(event, db)
        } else if (event.topics[0] === this.allTopics.EpochEnded) {
            console.log('EpochEnded')
            await this.epochEndedEvent(event, db)
        } else if (event.topics[0] === this.allTopics._UserSignedUp) {
            console.log('Social: UserSignedUp')
            const _epoch = Number(event.topics[1])
            const _commitment = BigInt(event.topics[2]).toString()
            db.create('UserSignUp', {
                transactionHash: event.transactionHash,
                commitment: _commitment,
                epoch: _epoch,
            })
        } else if (event.topics[0] === this.allTopics._PostSubmitted) {
            console.log('Social: PostSubmitted')
            await this.postSubmittedEvent(event, db)
        } else if (event.topics[0] === this.allTopics._CommentSubmitted) {
            console.log('Social: CommentSubmitted')
            await this.commentSubmittedEvent(event, db)
        } else if (event.topics[0] === this.allTopics._VoteSubmitted) {
            console.log('Social: VoteSubmitted')
            await this.voteSubmittedEvent(event, db)
        } else if (event.topics[0] === this.allTopics._AirdropSubmitted) {
            console.log('Social: AirdropSubmitted')
            await this.airdropSubmittedEvent(event, db)
        } else {
            console.log(event)
            throw new Error(`Unrecognized event topic "${event.topics[0]}"`)
        }
    }

    private async verifyAttestationProof(
        index: number,
        _epoch: number,
        db: TransactionDB
    ) {
        const proof = await this._db.findOne('Proof', {
            where: {
                epoch: _epoch,
                index,
            },
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
        const rootEntry = await this._db.findOne('GSTRoot', {
            where: {
                epoch,
                root,
            },
        })
        if (!rootEntry) {
            console.log('Global state tree root does not exist')
            db.update('Proof', {
                where: {
                    epoch,
                    index,
                },
                update: {
                    valid: false,
                },
            })
            return { isProofValid: false, proof: formedProof }
        }
        return { isProofValid: true, proof: formedProof }
    }

    async commentSubmittedEvent(event: ethers.Event, db: TransactionDB) {
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
        const findComment = await this._db.findOne('Comment', {
            where: {
                transactionHash: commentId,
            },
        })

        const reputationProof = decodedData.proofRelated
        const proofNullifier = await this.unirepContract.hashReputationProof(
            reputationProof
        )
        const proofIndex = Number(
            await this.unirepContract.getProofIndex(proofNullifier)
        )

        const findValidProof = await this._db.findOne('Proof', {
            where: {
                index: proofIndex,
                epoch: _epoch,
            },
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
                _epoch,
                db
            )
            if (isProofValid === false) {
                console.log(`proof index ${proofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await this._db.findOne('Nullifier', {
            where: {
                nullifier: repNullifiers,
                confirmed: true,
            },
        })
        if (existingNullifier) {
            console.log(`comment duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        db.delete('Nulliifer', {
            where: {
                nullfier: repNullifiers,
                confirmed: false,
            },
        })
        db.create(
            'Nullifier',
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            }))
        )

        if (findComment) {
            db.update('Comment', {
                where: {
                    _id: findComment._id,
                },
                update: {
                    status: 1,
                    transactionHash: _transactionHash,
                    proofIndex,
                },
            })
        } else {
            db.create('Comment', {
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
        }
        db.update('Post', {
            where: {
                transactionHash: postId,
            },
            update: {},
        })
        // we can safely increment the comment count by finding all comments
        // and setting the value here because we're in a tx lock
        const commentCount = await this._db.count('Comment', {
            postId,
        })
        db.update('Post', {
            where: {
                transactionHash: postId,
            },
            update: {
                // add one for the current comment we're updating
                commentCount: commentCount + 1,
            },
        })
        db.delete('Record', {
            where: {
                transactionHash: _transactionHash,
                confirmed: false,
            },
        })
        db.create('Record', {
            to: _epochKey,
            from: _epochKey,
            upvote: 0,
            downvote: DEFAULT_COMMENT_KARMA,
            epoch: _epoch,
            action: ActionType.Comment,
            data: _transactionHash,
            transactionHash: _transactionHash,
        })
        const existingEpkRecord = await this._db.findOne('EpkRecord', {
            where: {
                epk: _epochKey,
                epoch: _epoch,
            },
        })
        // TODO: maybe need to upsert here
        db.update('EpkRecord', {
            where: {
                epk: _epochKey,
                epoch: _epoch,
            },
            update: {
                spent: existingEpkRecord.spent + DEFAULT_COMMENT_KARMA,
            },
        })
    }
    async postSubmittedEvent(event: ethers.Event, db: TransactionDB) {
        const postId = event.transactionHash
        const findPost = await this._db.findOne('Post', {
            where: {
                transactionHash: postId,
            },
        })

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

        const findValidProof = await this._db.findOne('Proof', {
            where: {
                index: proofIndex,
                epoch: _epoch,
            },
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
                _epoch,
                db
            )
            if (isProofValid === false) {
                console.log(`proof index ${proofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await this._db.findOne('Nullifier', {
            where: {
                nullifier: repNullifiers,
                confirmed: true,
            },
        })
        if (existingNullifier) {
            console.log(`post duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        db.delete('Nullifier', {
            where: {
                nullfier: repNullifiers,
                confirmed: false,
            },
        })
        db.create(
            'Nullifier',
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            }))
        )

        if (findPost) {
            db.update('Post', {
                where: {
                    _id: findPost._id,
                },
                update: {
                    status: 1,
                    transactionHash: _transactionHash,
                    proofIndex,
                },
            })
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
            db.create('Post', {
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
                status: 1,
            })
        }
        db.delete('Record', {
            where: {
                transactionHash: _transactionHash,
                confirmed: false,
            },
        })
        db.create('Record', {
            to: _epochKey,
            from: _epochKey,
            upvote: 0,
            downvote: DEFAULT_POST_KARMA,
            epoch: _epoch,
            action: ActionType.Post,
            data: _transactionHash,
            transactionHash: _transactionHash,
        })
        const existingEpkRecord = await this._db.findOne('EpkRecord', {
            where: {
                epk: _epochKey,
                epoch: _epoch,
            },
        })
        // TODO: use upsert here
        db.update('EpkRecord', {
            where: {
                _id: existingEpkRecord._id,
            },
            update: {
                spent: (existingEpkRecord?.spent ?? 0) + DEFAULT_POST_KARMA,
            },
        })
    }

    async voteSubmittedEvent(event: ethers.Event, db: TransactionDB) {
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

        const proof = await this._db.findOne('Proof', {
            where: {
                index: _toEpochKeyProofIndex,
                epoch: _epoch,
            },
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
                _epoch,
                db
            )
            if (isProofValid === false) {
                console.log(`proof index ${_toEpochKeyProofIndex} is invalid`)
                return
            }
        }

        const fromValidProof = await this._db.findOne('Proof', {
            where: {
                epoch: _epoch,
                index: fromProofIndex,
            },
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
                _epoch,
                db
            )
            if (isProofValid === false) {
                console.log(`proof index ${fromProofIndex} is invalid`)
                return
            }
        }

        const repNullifiers = decodedData.proofRelated.repNullifiers
            .map((n) => BigInt(n).toString())
            .filter((n) => n !== '0')
        const existingNullifier = await this._db.findOne('Nullifier', {
            where: {
                nullifier: repNullifiers,
                confirmed: true,
            },
        })
        if (existingNullifier) {
            console.log(`vote duplicated nullifier`, repNullifiers)
            return
        }
        // everything checks out, lets start mutating the db
        db.delete('Nullifier', {
            where: {
                nullfier: repNullifiers,
                confirmed: false,
            },
        })
        db.create(
            'Nullifier',
            repNullifiers.map((nullifier) => ({
                epoch: _epoch,
                nullifier,
            }))
        )
        const findVote = await this._db.findOne('Vote', {
            where: { transactionHash: voteId },
        })
        if (findVote) {
            db.update('Vote', {
                where: {
                    _id: findVote._id,
                },
                update: {
                    status: 1,
                    transactionHash: _transactionHash,
                },
            })
            // TODO: refactor this
            // if (findVote.postId) {
            //     await Post.updateOne(
            //         {
            //             transactionHash: findVote.postId,
            //         },
            //         {
            //             $inc: {
            //                 posRep: findVote.posRep,
            //                 negRep: findVote.negRep,
            //                 totalRep: findVote.negRep + findVote.posRep,
            //             },
            //         }
            //     )
            // } else if (findVote.commentId) {
            //     await Comment.updateOne(
            //         {
            //             transactionHash: findVote.commentId,
            //         },
            //         {
            //             $inc: {
            //                 posRep: findVote.posRep,
            //                 negRep: findVote.negRep,
            //                 totalRep: findVote.negRep + findVote.posRep,
            //             },
            //         }
            //     )
            // }
        } else {
            db.create('Vote', {
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
        }

        db.delete('Record', {
            where: {
                transactionHash: _transactionHash,
                confirmed: false,
            },
        })
        db.create('Record', {
            to: _toEpochKey,
            from: _fromEpochKey,
            upvote: _posRep,
            downvote: _negRep,
            epoch: _epoch,
            action: ActionType.Vote,
            transactionHash: _transactionHash,
            data: '',
        })
        {
            const epkRecord = await this._db.findOne('EpkRecord', {
                where: {
                    epk: _fromEpochKey,
                    epoch: _epoch,
                },
            })
            db.update('EpkRecord', {
                where: {
                    epk: _fromEpochKey,
                    epoch: _epoch,
                },
                update: {
                    spent: (epkRecord?.spent ?? 0) + _posRep + _negRep,
                },
            })
        }
        {
            const epkRecord = await this._db.findOne('EpkRecord', {
                where: {
                    epk: _toEpochKey,
                    epoch: _epoch,
                },
            })
            db.update('EpkRecord', {
                where: {
                    epk: _toEpochKey,
                    epoch: _epoch,
                },
                update: {
                    posRep: (epkRecord?.posRep ?? 0) + _posRep,
                    negRep: (epkRecord?.negRep ?? 0) + _negRep,
                },
            })
        }
    }

    async airdropSubmittedEvent(event: ethers.Event, db: TransactionDB) {
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

        const proof = await this._db.findOne('Proof', {
            where: {
                epoch: _epoch,
                index: proofIndex,
            },
        })
        if (!proof) throw new Error('Unable to find airdrop proof')
        const { isProofValid } = await this.verifyAttestationProof(
            proofIndex,
            _epoch,
            db
        )
        if (isProofValid === false) return

        db.delete('Record', {
            where: {
                transactionHash: _transactionHash,
                confirmed: false,
            },
        })
        db.create('Record', {
            to: _epochKey,
            from: 'UnirepSocial',
            upvote: DEFAULT_AIRDROPPED_KARMA,
            downvote: 0,
            epoch: _epoch,
            action: 'UST',
            data: '0',
            transactionHash: event.transactionHash,
        })
    }

    async epochEndedEvent(event: ethers.Event, db: TransactionDB) {
        console.log('update db from epoch ended event: ')
        // console.log(event);
        // update Unirep state
        const epoch = Number(event?.topics[1])
        const treeDepths = await this.unirepContract.treeDepths()
        this.epochTree[epoch] = await genNewSMT(
            treeDepths.epochTreeDepth,
            SMT_ONE_LEAF
        )
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
            treeDepths.globalStateTreeDepth,
            this.defaultGSTLeaf,
            2
        )
        this.epochGSTRootMap[this.currentEpoch] = new Map()
        db.upsert('Epoch', {
            where: {
                number: epoch,
            },
            update: {
                number: epoch,
                sealed: true,
                epochRoot: this.epochTree[epoch].getRootHash().toString(),
            },
            create: {
                number: epoch,
                sealed: true,
                epochRoot: this.epochTree[epoch].getRootHash().toString(),
            },
        })
    }

    async attestationEvent(event: ethers.Event, db: TransactionDB) {
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
        db.create('Attestation', {
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
        })

        const validProof = await this._db.findOne('Proof', {
            where: {
                epoch: _epoch,
                index: toProofIndex,
            },
        })
        if (!validProof) {
            throw new Error('Unable to find proof for attestation')
        }
        if (validProof.valid === false) {
            db.update('Attestation', {
                where: {
                    epoch: _epoch,
                    epochKey: _epochKey.toString(16),
                    // index: attestIndex,
                },
                update: {
                    valid: false,
                },
            })
            return
        }
        if (fromProofIndex) {
            const fromValidProof = await this._db.findOne('Proof', {
                where: {
                    epoch: _epoch,
                    index: fromProofIndex,
                },
            })
            if (!fromValidProof) {
                throw new Error('Unable to find from proof')
            }
            if (fromValidProof.valid === false || fromValidProof.spent) {
                db.update('Attestation', {
                    where: {
                        epoch: _epoch,
                        epochKey: _epochKey.toString(16),
                        // index: attestIndex,
                    },
                    update: {
                        valid: false,
                    },
                })
                return
            }
            db.update('Proof', {
                where: {
                    epoch: _epoch,
                    index: fromProofIndex,
                },
                update: {
                    spent: true,
                },
            })
        }
        db.update('Attestation', {
            where: {
                epoch: _epoch,
                epochKey: _epochKey.toString(16),
                // index: attestIndex,
            },
            update: {
                valid: true,
            },
        })
        const epochKey = _epochKey.toString(16)
        const attestations = this.epochKeyToAttestationsMap[epochKey]
        if (!attestations) this.epochKeyToAttestationsMap[epochKey] = []
        this.epochKeyToAttestationsMap[epochKey].push(attestation)
        this.epochKeyInEpoch[_epoch].set(epochKey, true)
    }

    async USTEvent(event: ethers.Event, db: TransactionDB) {
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'UserStateTransitioned',
            event.data
        )

        const transactionHash = event.transactionHash
        const epoch = Number(event.topics[1])
        const leaf = BigInt(event.topics[2])
        const proofIndex = Number(decodedData.proofIndex)

        // verify the transition
        const transitionProof = await this._db.findOne('Proof', {
            where: {
                index: proofIndex,
                event: 'IndexedUserStateTransitionProof',
            },
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
        const startTransitionProof = await this._db.findOne('Proof', {
            where: {
                event: 'IndexedStartedTransitionProof',
                index: transitionProof.proofIndexRecords[0],
            },
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
            const processAttestationsProof = await this._db.findOne('Proof', {
                where: {
                    event: 'IndexedProcessedAttestationsProof',
                    index: Number(proofIndexRecords[i]),
                },
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
            const findBlindHC = await this._db.findOne('Proof', {
                where: {
                    AND: [
                        {
                            outputBlindedHashChain: blindedHC.toString(),
                            event: [
                                'IndexedStartedTransitionProof',
                                'IndexedProcessedAttestationsProof',
                            ],
                        },
                        {
                            index: proofIndexRecords.map((i) => i),
                        },
                    ],
                },
            })
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
            const existingRoot = await this._db.findOne('GSTRoot', {
                where: {
                    epoch: fromEpoch,
                    root: gstRoot,
                },
            })
            if (!existingRoot) {
                console.log('Global state tree root mismatches')
                return
            }
        }
        {
            const existingRoot = await this._db.findOne('Epoch', {
                where: {
                    number: fromEpoch,
                    epochRoot: epochTreeRoot,
                },
            })
            if (!existingRoot) {
                console.log('Epoch tree root mismatches')
                return
            }
        }

        // check and save nullifiers
        const existingNullifier = await this._db.findOne('Nullifier', {
            where: {
                nullifier: epkNullifiers,
                confirmed: true,
            },
        })
        if (existingNullifier) {
            console.log(`duplicated nullifier`)
            return
        }
        // everything checks out, lets start mutating the db
        db.delete('Nullifier', {
            where: {
                nullfier: epkNullifiers,
                confirmed: false,
            },
        })
        db.create(
            'Nullifier',
            epkNullifiers.map((nullifier) => ({
                epoch,
                nullifier,
            }))
        )

        this.GSTLeaves[epoch].push(leaf)

        // update GST when new leaf is inserted
        // keep track of each GST root when verifying proofs
        this.globalStateTree[epoch].insert(leaf)
        this.epochGSTRootMap[epoch].set(
            this.globalStateTree[epoch].root.toString(),
            true
        )

        const leafIndexInEpoch = await this._db.count('GSTLeaf', {
            epoch,
        })
        db.create('GSTLeaf', {
            epoch,
            transactionHash,
            hash: leaf.toString(),
            index: leafIndexInEpoch,
        })
        db.create('GSTRoot', {
            epoch,
            root: this.globalStateTree[epoch].root.toString(),
        })
    }

    async userSignedUpEvent(event: ethers.Event, db: TransactionDB) {
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'UserSignedUp',
            event.data
        )

        const transactionHash = event.transactionHash
        const epoch = Number(event.topics[1])
        const idCommitment = BigInt(event.topics[2])
        const attesterId = Number(decodedData.attesterId)
        const airdrop = Number(decodedData.airdropAmount)

        const treeDepths = await this.unirepContract.treeDepths()

        const USTRoot = await computeInitUserStateRoot(
            treeDepths.userStateTreeDepth,
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
        const leafIndexInEpoch = await this._db.count('GSTLeaf', {
            epoch,
        })
        db.create('GSTLeaf', {
            epoch,
            transactionHash,
            hash: newGSTLeaf.toString(),
            index: leafIndexInEpoch,
        })
        db.create('GSTRoot', {
            epoch,
            root: this.globalStateTree[epoch].root.toString(),
        })
    }

    async USTProofEvent(event: ethers.Event, db: TransactionDB) {
        const _proofIndex = Number(event.topics[1])
        const decodedData = this.unirepContract.interface.decodeEventLog(
            'IndexedUserStateTransitionProof',
            event.data
        )
        if (!decodedData) {
            throw new Error('Failed to decode data')
        }
        const args = decodedData.proof
        // const proofIndexRecords = decodedData.proofIndexRecords.map((n) =>
        //     Number(n)
        // )

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

        db.create('Proof', {
            index: _proofIndex,
            proof: proof,
            publicSignals: publicSignals,
            blindedUserState: args.blindedUserStates[0].toString(),
            globalStateTree: args.fromGlobalStateTree.toString(),
            // proofIndexRecords: proofIndexRecords,
            transactionHash: event.transactionHash,
            event: 'IndexedUserStateTransitionProof',
            valid: isValid,
        })
    }

    async processAttestationProofEvent(event: ethers.Event, db: TransactionDB) {
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

        db.create('Proof', {
            index: _proofIndex,
            outputBlindedUserState: _outputBlindedUserState.toString(),
            outputBlindedHashChain: _outputBlindedHashChain.toString(),
            inputBlindedUserState: _inputBlindedUserState.toString(),
            proof: proof,
            transactionHash: event.transactionHash,
            event: 'IndexedProcessedAttestationsProof',
            valid: isValid,
        })
    }

    async startUSTProofEvent(event: ethers.Event, db: TransactionDB) {
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

        db.create('Proof', {
            index: _proofIndex,
            blindedUserState: _blindedUserState.toString(),
            blindedHashChain: _blindedHashChain.toString(),
            globalStateTree: _globalStateTree.toString(),
            proof: proof,
            transactionHash: event.transactionHash,
            event: 'IndexedStartedTransitionProof',
            valid: isValid,
        })
    }

    async userSignedUpProofEvent(event: ethers.Event, db: TransactionDB) {
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

        db.create('Proof', {
            index: _proofIndex,
            epoch: _epoch,
            proof: proof,
            publicSignals: publicSignals,
            transactionHash: event.transactionHash,
            event: 'IndexedUserSignedUpProof',
            valid: isValid,
        })
    }

    async reputationProofEvent(event: ethers.Event, db: TransactionDB) {
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

        db.create('Proof', {
            index: _proofIndex,
            epoch: _epoch,
            proof: proof,
            publicSignals: publicSignals,
            transactionHash: event.transactionHash,
            event: 'IndexedReputationProof',
            valid: isValid,
        })
    }

    async epochKeyProofEvent(event: ethers.Event, db: TransactionDB) {
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

        db.create('Proof', {
            index: _proofIndex,
            epoch: _epoch,
            proof: proof,
            publicSignals: publicSignals,
            transactionHash: event.transactionHash,
            event: 'IndexedEpochKeyProof',
            valid: isValid,
        })
    }
}