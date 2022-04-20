import { formatProofForSnarkjsVerification } from '@unirep/circuits'
import { ReputationProof } from '@unirep/contracts'
import { ethers } from 'ethers'
import {
    UNIREP_SOCIAL,
    DEFAULT_ETH_PROVIDER,
    DEFAULT_POST_KARMA,
    QueryType,
    UNIREP_SOCIAL_ATTESTER_ID,
    LOAD_POST_COUNT,
    titlePrefix,
    titlePostfix,
    UNIREP,
    UNIREP_ABI,
    UNIREP_SOCIAL_ABI,
    ActionType,
} from '../constants'
import Post from '../models/post'
import Comment from '../models/comment'
import Vote from '../models/vote'
import { verifyReputationProof } from '../controllers/utils'
import TransactionManager from '../daemons/TransactionManager'
import Nullifier from '../models/nullifiers'
import Record from '../models/record'

const getCommentsByPostId = async (req, res) => {
    const { postId } = req.params
    res.json(await Comment.find({ postId }).lean())
}

const getVotesByPostId = async (req, res) => {
    const { postId } = req.params
    res.json(await Vote.find({ postId }).lean())
}

const listAllPosts = async () => {
    // load posts
    const allPosts = await Post.find({ status: 1 }).lean()
    return allPosts
}

const getPostsWithEpks = async (epks: string[]) => {
    return Post.find({ epochKey: { $in: epks } })
}

const getPostWithId = async (postId: string) => {
    const post = await Post.findOne({ transactionHash: postId })
    if (!post) return null
    return [post.toObject()]
}

const getPostWithQuery = async (
    query: string,
    lastRead: string,
    epks: string[]
) => {
    // get posts and sort
    let allPosts: any[] = []
    const baseQuery = {
        ...(epks.length > 0 ? { epochKey: { $in: epks } } : {}),
    }
    if (query === QueryType.New) {
        allPosts = await Post.find(baseQuery).sort({
            created_at: -1,
        })
    } else if (query === QueryType.Boost) {
        allPosts = await Post.find(baseQuery).sort({
            posRep: -1,
        })
    } else if (query === QueryType.Comments) {
        allPosts = await Post.find(baseQuery).sort({
            commentCount: -1,
        })
    } else if (query === QueryType.Squash) {
        allPosts = await Post.find(baseQuery).sort({
            negRep: -1,
        })
    } else if (query === QueryType.Rep) {
        allPosts = await Post.find(baseQuery).sort({
            totalRep: -1,
        })
    }

    // filter out posts more than loadPostCount
    if (lastRead === '0') {
        return allPosts.slice(0, Math.min(LOAD_POST_COUNT, allPosts.length))
    } else {
        console.log('last read is : ' + lastRead)
        let index: number = -1
        allPosts.forEach((p, i) => {
            if (p.transactionHash === lastRead) {
                index = i
            }
        })
        if (index > -1) {
            return allPosts.slice(
                index + 1,
                Math.min(allPosts.length, index + 1 + LOAD_POST_COUNT)
            )
        } else {
            return allPosts.slice(0, LOAD_POST_COUNT)
        }
    }
}

const publishPost = async (req: any, res: any) => {
    // should have content, epk, proof, minRep, nullifiers, publicSignals
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        DEFAULT_ETH_PROVIDER
    )
    const unirepSocialContract = new ethers.Contract(
        UNIREP_SOCIAL,
        UNIREP_SOCIAL_ABI,
        DEFAULT_ETH_PROVIDER
    )
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

    const error = await verifyReputationProof(
        reputationProof,
        DEFAULT_POST_KARMA,
        unirepSocialId,
        currentEpoch
    )
    if (error !== undefined) {
        res.status(422).json({
            error,
        })
        return
    }

    const attestingFee = await unirepContract.attestingFee()

    const { title, content } = req.body

    const calldata = unirepSocialContract.interface.encodeFunctionData(
        'publishPost',
        [
            title !== undefined && title.length > 0
                ? `${titlePrefix}${title}${titlePostfix}${content}`
                : content,
            reputationProof,
        ]
    )
    const hash = await TransactionManager.queueTransaction(
        unirepSocialContract.address,
        {
            data: calldata,
            value: attestingFee,
        }
    )

    const post = await Post.create({
        content,
        title,
        epochKey: epochKey,
        epoch: currentEpoch,
        proveMinRep: minRep !== null ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        status: 0,
        transactionHash: hash,
    })
    await Nullifier.create(
        reputationProof.repNullifiers
            .filter((n) => n.toString() !== '0')
            .map((n) => ({
                nullifier: n.toString(),
                epoch: currentEpoch,
                transactionHash: hash,
                confirmed: false,
            }))
    )
    await Record.create({
        to: epochKey,
        from: epochKey,
        upvote: 0,
        downvote: DEFAULT_POST_KARMA,
        epoch: currentEpoch,
        action: ActionType.Post,
        data: hash,
        transactionHash: hash,
        confirmed: false,
    })

    res.json({
        transaction: hash,
        currentEpoch: currentEpoch,
        post,
    })
}

export default {
    getVotesByPostId,
    getCommentsByPostId,
    listAllPosts,
    getPostWithQuery,
    getPostWithId,
    publishPost,
}
