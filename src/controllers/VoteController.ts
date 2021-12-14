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

      const decodedProof = base64url.decode(data.proof.slice(reputationProofPrefix.length))
      const decodedPublicSignals = base64url.decode(data.publicSignals.slice(reputationPublicSignalsPrefix.length))
      const publicSignals = JSON.parse(decodedPublicSignals)
      const proof = JSON.parse(decodedProof)
      const repNullifiers = publicSignals.slice(0, maxReputationBudget)
      const epoch = publicSignals[maxReputationBudget]
      const epochKey = Number(publicSignals[maxReputationBudget + 1]).toString(16)
      const GSTRoot = publicSignals[maxReputationBudget + 2]
      const attesterId = publicSignals[maxReputationBudget + 3]
      const repNullifiersAmount = publicSignals[maxReputationBudget + 4]
      const minRep = publicSignals[maxReputationBudget + 5]
      const receiver = BigInt(parseInt(data.receiver, 16))
      let error

      let postProofIndex: number = 0
      if (data.isPost) {
        const post = await Post.findById(data.postId)
        console.log('find post proof index: ' + post?.proofIndex);
        if(post !== null) postProofIndex = post.proofIndex;
      } else {
        const comment = await Comment.findById(data.postId);
        console.log('find comment proof index: ' + comment?.proofIndex);
        if(comment !== null) postProofIndex = comment.proofIndex;
      }

      if(Number(postProofIndex) === 0) {
        error = 'Error: cannot find post proof index'
        return {error: error, transaction: undefined, currentEpoch: epoch};
      }

      error = await verifyReputationProof(publicSignals, proof, data.upvote + data.downvote, Number(unirepSocialId))
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
      
      await tx.wait()

      // save to db data
      const voteProofIndex = (await unirepSocialContract.getReputationProofIndex(publicSignals, proof)).toNumber()
      const newVote: IVote = {
        transactionHash: tx.hash.toString(),
        proofIndex: voteProofIndex,
        epoch,
        voter: epochKey,
        posRep: data.upvote,
        negRep: data.downvote,
        graffiti: "0",
        overwriteGraffiti: false,
      };

      if (data.isPost) {
        try {
          await Post.findByIdAndUpdate(data.postId, 
            { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false })
        } catch(e) {
          console.log('update votes of post error: ' + e)
          return {error: e, transaction: tx.hash};
        }

        await writeRecord(data.receiver, epochKey, data.upvote, data.downvote, epoch, ActionType.Vote, tx.hash.toString(), data.postId);
      } else {
        try {
          const comment = await Comment.findByIdAndUpdate(
            data.postId, 
            { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false }
          )
          if (comment !== undefined && comment !== null) {
            const dataId = `${data.postId}_${comment._id.toString()}`;
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