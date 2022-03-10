import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts';
import { ethers } from 'ethers'

import {
  UNIREP_SOCIAL,
  DEFAULT_ETH_PROVIDER,
  DEFAULT_POST_KARMA,
  QueryType,
  UNIREP_SOCIAL_ATTESTER_ID,
  loadPostCount,
  titlePrefix,
  titlePostfix,
  UNIREP,
  UNIREP_ABI,
  UNIREP_SOCIAL_ABI,
} from '../constants';
import Post, { IPost } from "../database/models/post";
import Comment, { IComment } from "../database/models/comment";
import { verifyReputationProof } from "../controllers/utils";
import TransactionManager from '../daemons/TransactionManager'

const filterOneComment = (comments: IComment[]) => {
    let score: number = 0;
    let ret: any = {};
    for (var i = 0; i < comments.length; i ++) {
        const _score = comments[i].posRep * 1.5 + comments[i].negRep * 0.5;
        if (_score >= score) {
            score = _score;
            ret = comments[i];
        }
    }
    return ret;
}

const commentIdToObject = (commentIds: string[]) => {
    const comments = Comment.find({transactionHash: {$in: commentIds}});
    return comments;
}

const listAllPosts = () => {
    const allPosts = Post.find({status: 1}).then(async(posts) => {
        let ret: any[] = [];
        for (var i = 0; i < posts.length; i ++) {
            ret = [...ret, posts[i].toObject()];
        }
        return ret;
    });
    return allPosts;
}

const getPostsWithEpks = async (epks: string[]) => {
  return Post.find({epochKey: {$in: epks}});
}

const getPostWithId = async (postId: string) => {
    const post = Post.findOne({ transactionHash: postId }).then(async (p) => {
        if (p !== null) {
            if (p.comments.length > 0) {
                const comments = await Comment.find({ transactionHash: {$in: p.comments} });
                return {...(p.toObject()), comments};
            } else {
                return p.toObject();
            }
        } else {
            return p;
        }
    });

    return post;
}

const getPostWithQuery = async (query: string, lastRead: string, epks: string[]) => {
    // get posts and sort
    let allPosts: any[] = [];
    if (epks.length === 0) {
      allPosts = await listAllPosts();
    } else {
      allPosts = await getPostsWithEpks(epks);
    }
    allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    if (query === QueryType.New) {
        // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    } else if (query === QueryType.Boost) {
      allPosts.sort((a, b) => a.posRep > b.posRep? -1 : 1);
    } else if (query === QueryType.Comments) {
      allPosts.sort((a, b) => a.comments.length > b.comments.length? -1 : 1);
    } else if (query === QueryType.Squash) {
      allPosts.sort((a, b) => a.negRep > b.negRep? -1 : 1);
    } else if (query === QueryType.Rep) {
      allPosts.sort((a, b) => (a.posRep - a.negRep) >= (b.posRep - b.negRep)? -1 : 1);
    }

    // console.log(allPosts);

    // filter out posts more than loadPostCount
    if (lastRead === '0') {
        return allPosts.slice(0, Math.min(loadPostCount, allPosts.length));
    } else {
        console.log('last read is : ' + lastRead);
        let index : number = -1;
        allPosts.forEach((p, i) => {
            if (p.transactionHash === lastRead) {
                index = i;
            }
        });
        if (index > -1) {
            return allPosts.slice(index+1, Math.min(allPosts.length, index + 1 + loadPostCount));
        } else {
            return allPosts.slice(0, loadPostCount);
        }
    }
}

const publishPost = async (req: any, res: any) => { // should have content, epk, proof, minRep, nullifiers, publicSignals
    const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
    const currentEpoch = Number(await unirepContract.currentEpoch())

    // Parse Inputs
    const { publicSignals, proof } = req.body
    const reputationProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
    const epochKey = BigInt(reputationProof.epochKey.toString()).toString(16)
    const minRep = Number(reputationProof.minRep)

    const error = await verifyReputationProof(
        reputationProof,
        DEFAULT_POST_KARMA,
        unirepSocialId,
        currentEpoch
    )
    if (error !== undefined) {
        throw error
    }

    const attestingFee = await unirepContract.attestingFee()

    const { title, content } = req.body

    const calldata = unirepSocialContract.interface.encodeFunctionData('publishPost', [
      title !== undefined && title.length > 0? `${titlePrefix}${title}${titlePostfix}${content}` : content,
      reputationProof,
    ])
    const hash = await TransactionManager.queueTransaction(
      unirepSocialContract.address,
      {
        data: calldata,
        value: attestingFee,
        gasLimit: 1000000, // don't estimate for now
      })

    const newPost: IPost = new Post({
        content,
        title,
        epochKey: epochKey,
        epoch: currentEpoch,
        proveMinRep: minRep !== null ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        comments: [],
        status: 0,
        transactionHash: hash
    });

    const post = await newPost.save()
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
