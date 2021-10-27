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
      const proofIndex = (await unirepSocialContract.getReputationProofIndex(publicSignals, proof)).toNumber()

      const isProofValid = await unirepSocialContract.verifyReputation(
        publicSignals,
        proof,
      )
      if (!isProofValid) {
          console.error('Error: invalid reputation proof')
          return
      }

      console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote}`)
      
      const tx = await unirepSocialContract.vote(publicSignals, proof, receiver, proofIndex, data.upvote, data.downvote);

      // save to db data
      const newVote: IVote = {
        transactionHash: tx.hash.toString(),
        proofIndex,
        epoch,
        voter: epochKey,
        posRep: data.upvote,
        negRep: data.downvote,
        graffiti: "0",
        overwriteGraffiti: false,
      };

      if (data.isPost) {
        Post.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote } },
          { "new": true, "upsert": false }, 
          (err) => console.log('update votes of post error: ' + err));
      } else {
        Comment.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote } },
          { "new": true, "upsert": false }, 
          (err) => console.log('update votes of comment error: ' + err));
      }

      const newRecord: IRecord = new Record({
        to: data.receiver,
        from: epochKey,
        upvote: data.upvote,
        downvote: data.downvote,
        epoch,
        action: 'Vote',
      });
      await newRecord.save();

      return {transaction: tx.hash};
    }
  }

  export = new VoteController();