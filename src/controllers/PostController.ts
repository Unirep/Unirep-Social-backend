import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, DEFAULT_POST_KARMA } from '../constants';
import base64url from 'base64url';
import Post, { IPost } from "../database/models/post";
import { GSTRootExists, nullifierExists } from "../database/utils"
import Record, { IRecord } from '../database/models/record';
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
      const repNullifiers = publicSignals.slice(0, maxReputationBudget)
      const epoch = publicSignals[maxReputationBudget]
      const epochKey = Number(publicSignals[maxReputationBudget + 1]).toString(16)
      const GSTRoot = publicSignals[maxReputationBudget + 2]
      const repNullifiersAmount = publicSignals[maxReputationBudget + 4]
      const minRep = publicSignals[maxReputationBudget + 5]

      const isProofValid = await unirepSocialContract.verifyReputation(
        publicSignals,
        proof,
      )
      if (!isProofValid) {
          console.error('Error: invalid reputation proof')
          return
      }

      // check GST root
      const validRoot = await GSTRootExists(Number(epoch), GSTRoot)
      if(!validRoot){
        console.error(`Error: invalid global state tree root ${GSTRoot}`)
        return
      }

      // check nullifiers
      for (let nullifier of repNullifiers) {
        const seenNullifier = await nullifierExists(nullifier)
        if(seenNullifier) {
          console.error(`Error: invalid reputation nullifier ${nullifier}`)
          return
        }
      }
      
      const newPost: IPost = new Post({
        content: data.content,
        epochKey,
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
      const tx = await unirepSocialContract.publishPost(postId, publicSignals, proof, data.content);
      console.log('transaction hash: ' + tx.hash + ', epoch key of epoch ' + epoch + ': ' + epochKey);

      const proofIndex = await unirepSocialContract.getReputationProofIndex(publicSignals, proof) // proof index should wait until on chain --> server listening
      await newPost.save((err, post) => {
        console.log('new post error: ' + err);
        Post.findByIdAndUpdate(
          postId,
          { transactionHash: tx.hash.toString(), proofIndex },
          { "new": true, "upsert": false }, 
          (err) => console.log('update transaction hash of posts error: ' + err)
        );
      });

      const newRecord: IRecord = new Record({
        to: epochKey,
        from: epochKey,
        upvote: 0,
        downvote: DEFAULT_POST_KARMA,
        epoch,
        action: 'Post',
        data: postId,
      });
      await newRecord.save();
      
      return {transaction: tx.hash, postId: newPost._id, currentEpoch: epoch};
    }
  }

  export = new PostController();