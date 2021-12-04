import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, DEFAULT_COMMENT_KARMA, UNIREP_SOCIAL_ATTESTER_ID } from '../constants';
import base64url from 'base64url';
import Comment, { IComment } from "../database/models/comment";
import { verifyReputationProof } from "../controllers/utils"
import { UnirepSocialContract } from '@unirep/unirep-social';

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    leaveComment = async (data: any) => {
      console.log(data);

      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
      const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID

      // Parse Inputs
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

      // check attester ID
      if(Number(unirepSocialId) !== Number(attesterId)) {
        console.error('Error: proof with wrong attester ID')
        return {error: 'Error: proof with wrong attester ID', transaction: undefined, commentId: undefined, currentEpoch: epoch};
      }

      // check reputation amount
      if(Number(repNullifiersAmount) !== DEFAULT_COMMENT_KARMA) {
        console.error('Error: proof with wrong reputation amount')
        return {error: 'Error: proof with wrong reputation amount', transaction: undefined, commentId: undefined, currentEpoch: epoch};
      }

      const isProofValid = await verifyReputationProof(publicSignals, proof)
      if (!isProofValid) {
        console.error('Error: invalid reputation proof')
        return {error: 'Error: invalid reputation proof', transaction: undefined, commentId: undefined, currentEpoch: epoch};
      }

      const newComment: IComment = new Comment({
        postId: data.postId,
        content: data.content, // TODO: hashedContent
        epochKey,
        epoch,
        // epkProof: proof.map((n)=>add0x(BigInt(n).toString(16))),
        proveMinRep: minRep !== 0 ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        status: 0
      });

      const commentId = newComment._id.toString();

      const tx = await unirepSocialContract.leaveComment(
        publicSignals,
        proof,
        data.postId,
        commentId,
        data.content,
      );
      // await tx.wait()
      const proofIndex = await unirepSocialContract.getReputationProofIndex(publicSignals, proof)
      console.log('transaction: ' + tx.hash + ', proof index: ' + proofIndex);

      await newComment.save((err, comment) => {
        console.log('new comment error: ' + err);
      });

      return {error: undefined, transaction: tx.hash, commentId: commentId, currentEpoch: epoch}
    }
  }

  export = new CommentController();