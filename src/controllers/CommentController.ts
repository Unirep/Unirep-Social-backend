import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts'
import { ethers } from 'ethers'
import {
  UNIREP,
  UNIREP_SOCIAL_ABI,
  UNIREP_ABI,
  UNIREP_SOCIAL,
  DEFAULT_ETH_PROVIDER,
  DEFAULT_COMMENT_KARMA,
  UNIREP_SOCIAL_ATTESTER_ID,
  QueryType,
  loadPostCount
} from '../constants';
import Comment, { IComment } from "../database/models/comment";
import { verifyReputationProof } from "../controllers/utils"
import TransactionManager from '../daemons/TransactionManager'

const listAllComments = async () => {
    const comments = await Comment.find({})
    return comments.map(c => c.toObject())
}

const getCommentsWithEpks = async (epks: string[]) => {
    return Comment.find({epochKey: {$in: epks}});
}

const getCommentsWithQuery = async (query: string, lastRead: string, epks: string[]) => {
    let allComments: any[] = [];
    if (epks.length === 0) {
      allComments = await listAllComments();
    } else {
      allComments = await getCommentsWithEpks(epks);
    }
    allComments.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    if (query === QueryType.New) {
        // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
    } else if (query === QueryType.Boost) {
      allComments.sort((a, b) => a.posRep > b.posRep? -1 : 1);
    } else if (query === QueryType.Squash) {
      allComments.sort((a, b) => a.negRep > b.negRep? -1 : 1);
    } else if (query === QueryType.Rep) {
      allComments.sort((a, b) => (a.posRep - a.negRep) >= (b.posRep - b.negRep)? -1 : 1);
    }

    // console.log(allComments);

    // filter out posts more than loadPostCount
    if (lastRead === '0') {
        return allComments.slice(0, Math.min(loadPostCount, allComments.length));
    } else {
        let index : number = -1;
        allComments.forEach((p, i) => {
            if (p.transactionHash === lastRead) {
                index = i;
            }
        });
        if (index > -1) {
            return allComments.slice(index+1, Math.min(allComments.length, index + 1 + loadPostCount));
        } else {
            return allComments.slice(0, loadPostCount);
        }
    }
}

const leaveComment = async (req: any, res: any) => {
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
        DEFAULT_COMMENT_KARMA,
        unirepSocialId,
        currentEpoch
    )
    if (error !== undefined) {
      throw error
    }

    const attestingFee = await unirepContract.attestingFee()
    const calldata = unirepSocialContract.interface.encodeFunctionData('leaveComment', [
      '0x' + req.body.postId,
      req.body.content,
      reputationProof,
    ])
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
        transactionHash: hash
    });

    const comment = await newComment.save();

    res.json({
      error: error,
      transaction: hash,
      currentEpoch: currentEpoch,
      comment
    })
}

export default {
  leaveComment,
  getCommentsWithQuery,
  getCommentsWithEpks,
  listAllComments,
}
