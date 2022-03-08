import ErrorHandler from '../ErrorHandler';
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
import TransactionManager from '../TransactionManager'

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    listAllComments = () => {
        const allComments = Comment.find({}).then(async(comments) => {
            let ret: any[] = [];
            for (var i = 0; i < comments.length; i ++) {
                ret = [...ret, comments[i].toObject()];
            }
            return ret;
        });
        return allComments;
    }

    getCommentsWithEpks = async (epks: string[]) => {
        return Comment.find({epochKey: {$in: epks}});
    }

    getCommentsWithQuery = async (query: string, lastRead: string, epks: string[]) => {
        let allComments: any[] = [];
        if (epks.length === 0) {
          allComments = await this.listAllComments();
        } else {
          allComments = await this.getCommentsWithEpks(epks);
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

    leaveComment = async (data: any) => {
        const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
        const currentEpoch = Number(await unirepContract.currentEpoch())

        // Parse Inputs
        const { publicSignals, proof } = data
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
            return {error: error, transaction: undefined, postId: undefined, currentEpoch: currentEpoch};
        }

        const attestingFee = await unirepContract.attestingFee()
        const calldata = unirepSocialContract.interface.encodeFunctionData('leaveComment', [
          '0x' + data.postId,
          data.content,
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
            postId: data.postId,
            content: data.content, // TODO: hashedContent
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

        return {
          error: error,
          transaction: hash,
          currentEpoch: currentEpoch,
          comment
        }
    }
}

export = new CommentController();
