import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, ActionType, UNIREP_SOCIAL_ATTESTER_ID } from '../constants';
import { IVote } from '../database/models/vote';
import Post from '../database/models/post';
import Comment from '../database/models/comment';
import { verifyReputationProof } from "../controllers/utils"
import base64url from 'base64url';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { writeRecord } from '../database/utils';


class VoteController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    vote = async (data: any) => {
      console.log(data);

      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
      const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
      const unirepContract = await unirepSocialContract.getUnirep()
      const currentEpoch = await unirepContract.currentEpoch()

      const decodedProof = base64url.decode(data.proof.slice(reputationProofPrefix.length))
      const decodedPublicSignals = base64url.decode(data.publicSignals.slice(reputationPublicSignalsPrefix.length))
      const publicSignals = JSON.parse(decodedPublicSignals)
      const proof = JSON.parse(decodedProof)
      const epoch = publicSignals[maxReputationBudget]
      const epochKey = Number(publicSignals[maxReputationBudget + 1]).toString(16)
      const receiver = BigInt(parseInt(data.receiver, 16))
      let error

      let postProofIndex: number = 0
      if (data.isPost) {
        const post = await Post.findOne({ transactionHash: data.dataId })
        console.log('find post proof index: ' + post?.proofIndex);
        if(post !== null) postProofIndex = post.proofIndex;
      } else {
        const comment = await Comment.findOne({ transactionHash: data.dataId });
        console.log('find comment proof index: ' + comment?.proofIndex);
        if(comment !== null) postProofIndex = comment.proofIndex;
      }

      if(Number(postProofIndex) === 0) {
        error = 'Error: cannot find post proof index'
        return {error: error, transaction: undefined, currentEpoch: epoch};
      }

      error = await verifyReputationProof(publicSignals, proof, data.upvote + data.downvote, Number(unirepSocialId), currentEpoch)
      if (error !== undefined) {
        return {error: error, transaction: undefined, postId: undefined, currentEpoch: epoch};
      }

      console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote}`)
      
      console.log('post proof index', postProofIndex)
      let tx
      try {
        tx = await unirepSocialContract.vote(publicSignals, proof, receiver, postProofIndex, data.upvote, data.downvote);
      } catch(e) {
        return {error: e, transaction: tx?.hash, postId: undefined, currentEpoch: epoch};
      }
      
      // save to db data
      const newVote: IVote = {
        transactionHash: tx.hash.toString(),
        epoch,
        voter: epochKey,
        posRep: data.upvote,
        negRep: data.downvote,
        graffiti: "0",
        overwriteGraffiti: false,
      };

      if (data.isPost) {
        try {
          await Post.findOneAndUpdate(
            { transactionHash: data.dataId }, 
            { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false })
        } catch(e) {
          console.log('update votes of post error: ' + e)
          return {error: e, transaction: tx.hash};
        }

        await writeRecord(data.receiver, epochKey, data.upvote, data.downvote, epoch, ActionType.Vote, tx.hash.toString(), data.dataId);
      } else {
        try {
          const comment = await Comment.findOneAndUpdate(
            { transactionHash: data.dataId }, 
            { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false }
          )
          if (comment !== undefined && comment !== null) {
            const dataId = `${comment.postId}_${comment.transactionHash}`;
            await writeRecord(data.receiver, epochKey, data.upvote, data.downvote, epoch, ActionType.Vote, tx.hash.toString(), dataId);
          }

        } catch (e) {
            console.log('update votes of comment error: ' + e);
            return {error: e, transaction: tx.hash};
        }
      }
      
      return {error: error, transaction: tx.hash};
    }
  }

  export = new VoteController();