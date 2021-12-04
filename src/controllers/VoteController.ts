import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, ActionType, UNIREP_SOCIAL_ATTESTER_ID } from '../constants';
import { IVote } from '../database/models/vote';
import Post from '../database/models/post';
import Comment from '../database/models/comment';
import { verifyReputationProof, writeRecord } from "../controllers/utils"
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

      // check attester ID
      if(Number(unirepSocialId) !== Number(attesterId)) {
        console.error('Error: proof with wrong attester ID')
        return {error: 'Error: proof with wrong attester ID', transaction: undefined, currentEpoch: epoch};
      }

      // check reputation amount
      if(Number(repNullifiersAmount) !== (data.upvote + data.downvote)) {
        console.error('Error: proof with wrong reputation amount')
        return {error: 'Error: proof with wrong reputation amount', transaction: undefined, currentEpoch: epoch};
      }

      const isProofValid = await verifyReputationProof(publicSignals, proof)
      if (!isProofValid) {
        console.error('Error: invalid reputation proof')
        return {error: 'Error: invalid reputation proof', transaction: undefined, currentEpoch: epoch};
      }

      console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote}`)
      
      const tx = await unirepSocialContract.vote(publicSignals, proof, receiver, postProofIndex, data.upvote, data.downvote);
      // await tx.wait()

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
        Post.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
          { "new": true, "upsert": false }, 
          (err) => console.log('update votes of post error: ' + err));

        await writeRecord(data.receiver, epochKey, data.upvote, data.downvote, epoch, ActionType.vote, tx.hash.toString(), data.postId);
      } else {
        Comment.findByIdAndUpdate(
          data.postId, 
          { "$push": { "votes": newVote }, "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
          { "new": true, "upsert": false }, 
          (err) => {
            console.log('update votes of comment error: ' + err);
          }).then( async (comment) => {
            if (comment !== undefined && comment !== null) {
              const dataId = `${data.postId}_${comment._id.toString()}`;
              await writeRecord(data.receiver, epochKey, data.upvote, data.downvote, epoch, ActionType.vote, tx.hash.toString(), dataId);
            }
          });
      }
    
      return {error: undefined, transaction: tx.hash};
    }
  }

  export = new VoteController();