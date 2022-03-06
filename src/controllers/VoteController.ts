import ErrorHandler from '../ErrorHandler';
import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts';
import { ethers } from 'ethers'
import {
  UNIREP,
  UNIREP_SOCIAL_ABI,
  UNIREP_ABI,
  UNIREP_SOCIAL,
  DEFAULT_ETH_PROVIDER,
  ActionType,
  UNIREP_SOCIAL_ATTESTER_ID
} from '../constants';
import { IVote } from '../database/models/vote';
import Proof from '../database/models/proof';
import Post from '../database/models/post';
import Comment from '../database/models/comment';
import { decodeReputationProof, verifyReputationProof } from "../controllers/utils"
import { writeRecord } from '../database/utils';
import TransactionManager from '../TransactionManager'

class VoteController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    vote = async (data: any) => {

        const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
        const currentEpoch = Number(await unirepContract.currentEpoch())


        const { publicSignals, proof } = decodeReputationProof(data.proof, data.publicSignals)
        const reputationProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
        const epochKey = BigInt(reputationProof.epochKey.toString()).toString(16)
        const receiver = parseInt(data.receiver, 16)

        const dataId = data.isPost? data.dataId : data.dataId.split('_')[1];

        let postProofIndex: number = 0
        if (data.isPost) {
            const post = await Post.findOne({ transactionHash: dataId })
            if (!post) {
              throw new Error('Post not found')
            }
            if (post.epoch !== currentEpoch) {
                return {error: "the epoch key is expired", transaction: undefined, currentEpoch: currentEpoch}
            }
            console.log('find post proof index: ' + post.proofIndex);
            const validProof = await Proof.findOne({ index: post.proofIndex, epoch: currentEpoch, valid: true })
            if (!validProof) {
                return { error: "vote to an invalid post", transaction: undefined, currentEpoch: currentEpoch}
            }
            postProofIndex = post.proofIndex;
        } else {
            const comment = await Comment.findOne({ transactionHash: dataId });
            if (!comment) {
              throw new Error('Comment not found')
            }
            if (comment.epoch !== currentEpoch) {
                return {error: "the epoch key is expired", transaction: undefined, currentEpoch: currentEpoch}
            }
            console.log('find comment proof index: ' + comment.proofIndex);
            const validProof = await Proof.findOne({ index: comment.proofIndex, epoch: currentEpoch, valid: true })
            if (!validProof) {
                return { error: "vote to an invalid comment", transaction: undefined, currentEpoch: currentEpoch}
            }
            postProofIndex = comment.proofIndex;
        }

        if (Number(postProofIndex) === 0) {
            const error = 'Error: cannot find post proof index'
            return {error: error, transaction: undefined, currentEpoch: currentEpoch};
        }

        const error = await verifyReputationProof(
            reputationProof,
            data.upvote + data.downvote,
            unirepSocialId,
            currentEpoch
        )
        if (error !== undefined) {
            return {error: error, transaction: undefined, postId: undefined, currentEpoch: currentEpoch};
        }

        console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote}`)

        console.log('post proof index', postProofIndex)

        const attestingFee = await unirepContract.attestingFee()
        const calldata = unirepSocialContract.interface.encodeFunctionData('vote', [
          data.upvote,
          data.downvote,
          receiver,
          postProofIndex,
          reputationProof,
        ])
        const hash = await TransactionManager.queueTransaction(
          unirepSocialContract.address,
          {
            data: calldata,
            // TODO: make this more clear?
            // 2 attestation calls into unirep: https://github.com/Unirep/Unirep-Social/blob/alpha/contracts/UnirepSocial.sol#L200
            value: attestingFee.mul(2),
          }
        )
        // save to db data
        const newVote: IVote = {
            transactionHash: hash,
            epoch: currentEpoch,
            voter: epochKey,
            posRep: data.upvote,
            negRep: data.downvote,
            graffiti: "0",
            overwriteGraffiti: false,
        };

        if (data.isPost) {
            await Post.findOneAndUpdate(
                { transactionHash: dataId },
                { "$push": { "votes": newVote },
                  "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
                { "new": true, "upsert": false }
            )

            await writeRecord(
                data.receiver,
                epochKey,
                data.upvote,
                data.downvote,
                currentEpoch,
                ActionType.Vote,
                hash,
                data.dataId
            );
        } else {
            const comment = await Comment.findOneAndUpdate(
                { transactionHash: dataId },
                { "$push": { "votes": newVote },
                "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
                { "new": true, "upsert": false }
            )
            if (comment !== undefined && comment !== null) {
                await writeRecord(
                    data.receiver,
                    epochKey,
                    data.upvote,
                    data.downvote,
                    currentEpoch,
                    ActionType.Vote,
                    hash,
                    data.dataId
                );
            }
        }
      return {error: error, transaction: hash};
    }
}

export = new VoteController();
