import { formatProofForSnarkjsVerification } from '@unirep/circuits'
import { ReputationProof } from '@unirep/contracts'
import {
    DEFAULT_COMMENT_KARMA,
    UNIREP_SOCIAL_ATTESTER_ID,
    QueryType,
    LOAD_POST_COUNT,
    ActionType,
    unirepContract,
    unirepSocialContract,
} from '../constants'
import Comment, { IComment } from '../models/comment'
import Nullifier from '../models/nullifiers'
import { verifyReputationProof } from '../controllers/utils'
import TransactionManager from '../daemons/TransactionManager'
import Record from '../models/record'

const listAllComments = async () => {
    const comments = await Comment.find({})
    return comments.map((c) => c.toObject())
}

const getCommentsWithEpks = async (epks: string[]) => {
    return Comment.find({ epochKey: { $in: epks } })
}

const getCommentsWithQuery = async (
    query: string,
    lastRead: string,
    epks: string[]
) => {
    let allComments: any[] = []
    if (epks.length === 0) {
        allComments = await listAllComments()
    } else {
        allComments = await getCommentsWithEpks(epks)
    }
    allComments.sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    if (query === QueryType.New) {
        // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    } else if (query === QueryType.Boost) {
        allComments.sort((a, b) => (a.posRep > b.posRep ? -1 : 1))
    } else if (query === QueryType.Squash) {
        allComments.sort((a, b) => (a.negRep > b.negRep ? -1 : 1))
    } else if (query === QueryType.Rep) {
        allComments.sort((a, b) =>
            a.posRep - a.negRep >= b.posRep - b.negRep ? -1 : 1
        )
    }

    // console.log(allComments);

    // filter out posts more than loadPostCount
    if (lastRead === '0') {
        return allComments.slice(
            0,
            Math.min(LOAD_POST_COUNT, allComments.length)
        )
    } else {
        let index: number = -1
        allComments.forEach((p, i) => {
            if (p.transactionHash === lastRead) {
                index = i
            }
        })
        if (index > -1) {
            return allComments.slice(
                index + 1,
                Math.min(allComments.length, index + 1 + LOAD_POST_COUNT)
            )
        } else {
            return allComments.slice(0, LOAD_POST_COUNT)
        }
    }
}

const leaveComment = async (req: any, res: any) => {
    const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
    const currentEpoch = Number(await unirepContract.currentEpoch())

    // Parse Inputs
    const { publicSignals, proof } = req.body
    const reputationProof = new ReputationProof(
        publicSignals,
        formatProofForSnarkjsVerification(proof)
    )
    const epochKey = BigInt(reputationProof.epochKey.toString()).toString(16)
    const minRep = Number(reputationProof.minRep)

    {
        const exists = await Nullifier.exists({
            nullifier: {
                $in: reputationProof.repNullifiers.map((n) => n.toString()),
            },
        })
        if (exists) {
            res.status(422).json({
                error: 'Duplicate nullifier',
            })
            return
        }
    }

    const error = await verifyReputationProof(
        reputationProof,
        DEFAULT_COMMENT_KARMA,
        unirepSocialId,
        currentEpoch
    )
    if (error !== undefined) {
        throw error
    }

    const attestingFee = await unirepContract.attestingFee()
    const calldata = unirepSocialContract.interface.encodeFunctionData(
        'leaveComment',
        [
            req.body.postId as any,
            req.body.content as any,
            reputationProof as any,
        ]
    )
    const hash = await TransactionManager.queueTransaction(
        unirepSocialContract.address,
        {
            data: calldata,
            value: attestingFee,
        }
    )

    const newComment: IComment = new Comment({
        postId: req.body.postId,
        content: req.body.content, // TODO: hashedContent
        epochKey: epochKey,
        epoch: currentEpoch,
        proveMinRep: minRep !== 0 ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        status: 0,
        transactionHash: hash,
    })

    const comment = await newComment.save()

    await Nullifier.create(
        reputationProof.repNullifiers
            .filter((n) => n.toString() !== '0')
            .map((n) => ({
                epoch: currentEpoch,
                transactionHash: hash,
                nullifier: n.toString(),
                confirmed: false,
            }))
    )
    await Record.create({
        to: epochKey,
        from: epochKey,
        upvote: 0,
        downvote: DEFAULT_COMMENT_KARMA,
        epoch: currentEpoch,
        action: ActionType.Comment,
        data: hash,
        transactionHash: hash,
        confirmed: false,
    })

    res.json({
        error: error,
        transaction: hash,
        currentEpoch: currentEpoch,
        comment,
    })
}

export default {
    leaveComment,
    getCommentsWithQuery,
    getCommentsWithEpks,
    listAllComments,
}
