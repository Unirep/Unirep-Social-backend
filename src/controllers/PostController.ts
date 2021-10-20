import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget } from '../constants';
import base64url from 'base64url';
import Post, { IPost } from "../database/models/post";
import { UnirepSocialContract } from '@unirep/unirep-social';

class PostController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    listAllPosts = async () => {
        // let posts: any;
        // await listAllPosts({
        //     contract: UNIREP_SOCIAL,
        // }).then((ret) => {
        //     posts = ret;
        // });

        // return posts;
    }

    publishPost = async (data: any) => { // should have content, epk, proof, minRep, nullifiers, publicSignals  
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

      /// TODO: verify reputation proof ///
      
      const newPost: IPost = new Post({
        content: data.content,
        epochKey: data.epk,
        epoch,
        epkProof: proof.map((n)=>add0x(BigInt(n).toString(16))),
        proveMinRep: minRep !== null ? true : false,
        minRep: Number(minRep),
        posRep: 0,
        negRep: 0,
        comments: [],
        status: 0
      });

      const postId = newPost._id.toString();
      const txResult = await unirepSocialContract.publishPost(postId, publicSignals, proof, data.content);
      const tx = txResult.tx;
      console.log('transaction hash: ' + tx.hash + ', epoch key of epoch ' + epoch + ': ' + epochKey);

      await newPost.save((err, post) => {
        console.log('new post error: ' + err);
        Post.findByIdAndUpdate(
          postId,
          { transactionHash: tx.hash.toString() },
          { "new": true, "upsert": false }, 
          (err) => console.log('update transaction hash of posts error: ' + err)
        );
      });
      
      return {transaction: tx.hash, postId: newPost._id, currentEpoch: epoch};
    }
  }

  export = new PostController();