import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget } from '../constants';
import base64url from 'base64url';
import Comment, { IComment } from "../database/models/comment";
import Post from '../database/models/post';
import { UnirepSocialContract } from '@unirep/unirep-social';

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    leaveComment = async (data: any) => {
      console.log(data);

      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);

      // Parse Inputs
      const decodedProof = base64url.decode(data.proof.slice(reputationProofPrefix.length))
      const decodedPublicSignals = base64url.decode(data.publicSignals.slice(reputationPublicSignalsPrefix.length))
      const publicSignals = JSON.parse(decodedPublicSignals)
      const proof = JSON.parse(decodedProof)
      const epoch = publicSignals[maxReputationBudget]
      const epochKey = publicSignals[maxReputationBudget + 1]
      const repNullifiersAmount = publicSignals[maxReputationBudget + 4]
      const minRep = publicSignals[maxReputationBudget + 5]

      const newComment: IComment = new Comment({
        postId: data.postId,
        content: data.content, // TODO: hashedContent
        epochKey,
        epoch,
        epkProof: proof.map((n)=>add0x(BigInt(n).toString(16))),
        proveMinRep: minRep !== 0 ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        status: 0
      });

      const commentId = newComment._id.toString();

      const txResult = await unirepSocialContract.leaveComment(
        publicSignals,
        proof,
        data.postId,
        commentId,
        data.content,
      );
      const tx = txResult.tx;
      console.log('transaction: ' + tx.hash);

      await newComment.save((err, comment) => {
        console.log('new comment error: ' + err);
        Comment.findByIdAndUpdate(
          commentId,
          { transactionHash: tx.hash.toString() },
          { "new": true, "upsert": false }, 
          (err) => console.log('update transaction hash of comments error: ' + err)
        );
      });

      Post.findByIdAndUpdate(
        data.postId, 
        { "$push": { "comments": commentId } },
        { "new": true, "upsert": true }, 
        (err) => console.log('update comments of post error: ' + err));

      return {transaction: tx.hash, commentId}
    }
  }

  export = new CommentController();