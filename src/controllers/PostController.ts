import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, DEFAULT_POST_KARMA, ActionType, QueryType, UNIREP_SOCIAL_ATTESTER_ID, loadPostCount } from '../constants';
import base64url from 'base64url';
import Post, { IPost } from "../database/models/post";
import Comment, { IComment } from "../database/models/comment";
import { verifyReputationProof } from "../controllers/utils"; 
import { UnirepSocialContract } from '@unirep/unirep-social';
import post from '../database/models/post';

class PostController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    filterOneComment = (comments: IComment[]) => {
      let score: number = 0;
      let ret: any = {};
      for (var i = 0; i < comments.length; i ++) {
        const _score = comments[i].posRep * 1.5 + comments[i].negRep * 0.5;
        if (_score >= score) {
          score = _score;
          ret = comments[i];
        }
      }
      return ret;
    }

    commentIdToObject = (commentIds: string[]) => {
      const comments = Comment.find({transactionHash: {$in: commentIds}});
      return comments;
    }

    listAllPosts = () => {
      const allPosts = Post.find({}).then(async(posts) => {
        let ret: any[] = [];
        for (var i = 0; i < posts.length; i ++) {
          ret = [...ret, posts[i].toObject()];
        }
        return ret;
      });
      return allPosts;
    }

    getPostWithId = async (postId: string) => {
      const post = Post.findOne({ transactionHash: postId }).then(async (p) => {
        if (p !== null) {
          if (p.comments.length > 0) {
            const comments = await Comment.find({ transactionHash: {$in: p.comments} });
            return {...(p.toObject()), comments};
          } else {
            return p.toObject();
          }
        } else {
          return p;
        }
      });

      return post;
    }

    getPostWithQuery = async (query: string, lastRead: string) => {
      // get posts and sort
      const allPosts = await this.listAllPosts();
      allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
      if (query === QueryType.New) {
        // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
      } else if (query === QueryType.Boost) {
        allPosts.sort((a, b) => a.upvote > b.upvote? -1 : 1);
      } else if (query === QueryType.Comments) {
        allPosts.sort((a, b) => a.comments.length > b.comments.length? -1 : 1); 
      } else if (query === QueryType.Squash) {
        allPosts.sort((a, b) => a.downvote > b.downvote? -1 : 1); 
      } else if (query === QueryType.Rep) {
        allPosts.sort((a, b) => (a.upvote - a.downvote) >= (b.upvote - b.downvote)? -1 : 1); 
      }

      // filter out posts more than loadPostCount
      if (lastRead === '0') {
        return allPosts.slice(0, Math.min(loadPostCount, allPosts.length));
      } else {
        console.log('last read is : ' + lastRead);
        let index : number = -1;
        allPosts.forEach((p, i) => {
          if (p.transactionHash === lastRead) {
            index = i;
          }
        });
        if (index > -1) {
          return allPosts.slice(index+1, Math.min(allPosts.length, loadPostCount));
        } else {
          return allPosts.slice(0, loadPostCount);
        }
      }
    }

    publishPost = async (data: any) => { // should have content, epk, proof, minRep, nullifiers, publicSignals  
      console.log(data);

      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
      const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
      const unirepContract = await unirepSocialContract.getUnirep()
      const currentEpoch = await unirepContract.currentEpoch()

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
      let error

      error = await verifyReputationProof(publicSignals, proof, DEFAULT_POST_KARMA, Number(unirepSocialId), currentEpoch)
      if (error !== undefined) {
        return {error: error, transaction: undefined, postId: undefined, currentEpoch: epoch};
      }

      const randomNum = (Math.floor(Math.random() * (10^16))).toString()

      let tx
      try {
        tx = await unirepSocialContract.publishPost(randomNum, publicSignals, proof, data.content);
        // await tx.wait()
        console.log('transaction hash: ' + tx.hash + ', epoch key of epoch ' + epoch + ': ' + epochKey);

        const newPost: IPost = new Post({
          content: data.content,
          epochKey: epochKey,
          epoch: epoch,
          // epkProof: proof.map((n)=>add0x(BigInt(n).toString(16))),
          proveMinRep: minRep !== null ? true : false,
          minRep: Number(minRep),
          posRep: 0,
          negRep: 0,
          comments: [],
          status: 0,
          transactionHash: tx.hash
        });

        await newPost.save((err, post) => {
          console.log('new post error: ' + err);
          error = err;
        });
        return {error: error, transaction: tx.hash, currentEpoch: epoch};
      } catch (e) {
        return {error: e, transaction: tx?.hash, currentEpoch: epoch}
      }
    }
  }

  export = new PostController();