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
import Post, { IPost } from '../models/post'
import Comment, { IComment } from '../models/comment'
import { verifyReputationProof } from '../controllers/utils'
import TransactionManager from '../daemons/TransactionManager'
import Nullifier from '../models/nullifiers'
import Record from '../models/record'

const listAllPosts = async () => {
    const allPosts = await Post.find({ status: 1 }).lean()
    const comments = await Comment.find({
        postId: {
            $in: allPosts.map((p) => p.transactionHash),
        },
    }).lean()
    const commentsByPostId = comments.reduce((acc, c) => {
        return {
            ...acc,
            [c.postId]: [...(acc[c.postId] ?? []), c],
        }
    }, {})

    return allPosts.map((p) => ({
        ...p,
        comments: commentsByPostId[p.transactionHash] ?? [],
    }))
}

const getPostsWithEpks = async (epks: string[]) => {
    return Post.find({ epochKey: { $in: epks } })
}

const getPostWithId = async (postId: string) => {
    const post = await Post.findOne({ transactionHash: postId })
    if (!post) return null
    const comments = await Comment.find({
        postId,
    })
    return {
        ...post.toObject(),
        comments,
    }
}

const getPostWithQuery = async (
    query: string,
    lastRead: string,
    epks: string[]
) => {
    // get posts and sort
    let allPosts: any[] = []
    if (epks.length === 0) {
        allPosts = await listAllPosts()
    } else {
        allPosts = await getPostsWithEpks(epks)
    }
    allPosts.sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    if (query === QueryType.New) {
        // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    } else if (query === QueryType.Boost) {
        allPosts.sort((a, b) => (a.posRep > b.posRep ? -1 : 1))
    } else if (query === QueryType.Comments) {
        allPosts.sort((a, b) =>
            a.comments.length > b.comments.length ? -1 : 1
        )
    } else if (query === QueryType.Squash) {
        allPosts.sort((a, b) => (a.negRep > b.negRep ? -1 : 1))
    } else if (query === QueryType.Rep) {
        allPosts.sort((a, b) =>
            a.posRep - a.negRep >= b.posRep - b.negRep ? -1 : 1
        )
    }

    // console.log(allPosts);

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
    listAllPosts,
    getPostWithQuery,
    getPostWithId,
    publishPost,
}
