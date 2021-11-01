import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget } from '../constants';
import { IVote } from '../database/models/vote';
import Post from '../database/models/post';
import Comment from '../database/models/comment';
import Record, { IRecord } from '../database/models/record';
import base64url from 'base64url';
import { UnirepSocialContract } from '@unirep/unirep-social';


class VoteController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    vote = async (data: any) => {
      console.log(data);

      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);

      const decodedProof = base64url.decode(data.proof.slice(reputationProofPrefix.length))
      const decodedPublicSignals = base64url.decode(data.publicSignals.slice(reputationPublicSignalsPrefix.length))
      const publicSignals = JSON.parse(decodedPublicSignals)
      const proof = JSON.parse(decodedProof)
      const epoch = publicSignals[maxReputationBudget]
      const epochKey = Number(publicSignals[maxReputationBudget + 1]).toString(16)
      const repNullifiersAmount = publicSignals[maxReputationBudget + 4]
      const minRep = publicSignals[maxReputationBudget + 5]
      const receiver = BigInt(parseInt(data.receiver, 16))

      let postProofIndex: number = 0
      if (data.isPost) {
        Post.findById(data.postId, (err, post) => {
          console.log('find post proof index: ' + post.proofIndex);
          postProofIndex = post.proofIndex;
        });
      } else {
        Comment.findById(data.postId, (err, comment) => {
          console.log('find comment proof index: ' + comment.proofIndex);
          postProofIndex = comment.proofIndex;
        });
      }

      const isProofValid = await unirepSocialContract.verifyReputation(
        publicSignals,
        proof,
      )
      if (!isProofValid) {
          console.error('Error: invalid reputation proof')
          return
      }

      console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote}`)
      
      const tx = await unirepSocialContract.vote(publicSignals, proof, receiver, postProofIndex, data.upvote, data.downvote);

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

      let newRecord: IRecord;
      if (data.isPost) {
        Post.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote } },
          { "new": true, "upsert": false }, 
          (err) => console.log('update votes of post error: ' + err));
        newRecord = new Record({
            to: data.receiver,
            from: epochKey,
            upvote: data.upvote,
            downvote: data.downvote,
            epoch,
            action: 'Vote',
            data: data.postId,
          });
          await newRecord.save();
      } else {
        Comment.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote } },
          { "new": true, "upsert": false }, 
          (err, comment) => {
            console.log('update votes of comment error: ' + err);
            if (comment !== undefined && comment !== null) {
              newRecord = new Record({
                to: data.receiver,
                from: epochKey,
                upvote: data.upvote,
                downvote: data.downvote,
                epoch,
                action: 'Vote',
                data: `${comment.postId}_${data.postId}`,
              });
              newRecord.save();
            }
          });
      }
    
      return {transaction: tx.hash};
    }
  }

  export = new VoteController();