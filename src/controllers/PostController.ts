import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x, reputationProofPrefix, reputationPublicSignalsPrefix, maxReputationBudget, DEFAULT_POST_KARMA, ActionType, QueryType } from '../constants';
import base64url from 'base64url';
import Post, { IPost } from "../database/models/post";
import Comment, { IComment } from "../database/models/comment";
import { GSTRootExists, nullifierExists, writeRecord } from "../database/utils"; 
import { UnirepSocialContract } from '@unirep/unirep-social';

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
      const comments = Comment.find({'_id': {$in: commentIds}});
      return comments;
    }

    listAllPosts = () => {
      const allPosts = Post.find({}).then(async(posts) => {
        let ret: any[] = [];

        for (var i = 0; i < posts.length; i ++) {
          // const comments = await this.commentIdToObject(posts[i].comments);
          // const p = {...posts[i].toObject(), comments};
          // ret = [...ret, p];
          ret = [...ret, posts[i].toObject()];
        }

        return ret;
      });

      return allPosts;
    }

    getPostWithId = async (postId: string) => {
      const post = Post.findById(postId).then(async (p) => {
        if (p !== null) {
          if (p.comments.length > 0) {
            const comments = await Comment.find({'_id': {$in: p.comments}});
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

    getPostWithQuery = async (sort: string, maintype: string, subtype: string, start: number, end: number, lastRead: string) => {
      const allPosts = await this.listAllPosts();
      let tmp: any[] = [];
      if (maintype === QueryType.popularity) {
        allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);

        let inPosts: any[] = [];
        let outPosts: any[] = [];
        // 1. classify posts to [in time range] and [out of time range]
        allPosts.forEach((post) => {
          const postTime = Date.parse(post.created_at);
          if (postTime >= start && postTime <= end) {
            inPosts = [...inPosts, post];
          } else {
            outPosts = [...outPosts, post];
          }
        });
        // 2. sort each of the groups by subtype & sort
        if (subtype === QueryType.reputation) {
          console.log('query by reputation');
          if (sort === QueryType.most) {
            inPosts.sort((a, b) => a.reputation > b.reputation? -1 : 1);
            outPosts.sort((a, b) => a.reputation > b.reputation? -1 : 1);
          } else {
            inPosts.sort((a, b) => a.reputation > b.reputation? 1 : -1);
            outPosts.sort((a, b) => a.reputation > b.reputation? 1 : -1);
          }
        } else if (subtype === QueryType.votes) {
          console.log('query by votes');
          if (sort === QueryType.most) {
            inPosts.sort((a, b) => a.posRep + a.negRep > b.posRep + b.negRep? -1 : 1);
            outPosts.sort((a, b) => a.posRep + a.negRep > b.posRep + b.negRep? -1 : 1);
          } else {
            inPosts.sort((a, b) => a.posRep + a.negRep > b.posRep + b.negRep? 1 : -1);
            outPosts.sort((a, b) => a.posRep + a.negRep > b.posRep + b.negRep? 1 : -1);
          }
        } else if (subtype === QueryType.upvotes) {
          console.log('query by upvotes');
          if (sort === QueryType.most) {
            inPosts.sort((a, b) => a.posRep > b.posRep? -1 : 1);
            outPosts.sort((a, b) => a.posRep > b.posRep? -1 : 1);
          } else {
            inPosts.sort((a, b) => a.posRep > b.posRep? 1 : -1);
            outPosts.sort((a, b) => a.posRep > b.posRep? 1 : -1);
          }
        } else if (subtype === QueryType.comments) {
          console.log('query by comments');
          if (sort === QueryType.most) {
            inPosts.sort((a, b) => a.comments.length > b.comments.length? -1 : 1);
            outPosts.sort((a, b) => a.comments.length > b.comments.length? -1 : 1);
          } else {
            inPosts.sort((a, b) => a.comments.length > b.comments.length? 1 : -1);
            outPosts.sort((a, b) => a.comments.length > b.comments.length? 1 : -1);
          }
        } 
        tmp = [...inPosts, ...outPosts];
        // 3. see which is the lastRead one, load posts behind it
      } else if (maintype === QueryType.time) {
        // subtype is posts --> sort posts by time
        if (sort === QueryType.newest) {
          if (subtype === QueryType.posts) {
            console.log('query by newest posts');
            allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
          } else if (subtype === QueryType.comments) {
            console.log('query by newest comments');
            allPosts.sort((a, b) => a.updated_at > b.updated_at? -1 : 1);
          }
        } else if (sort === QueryType.oldest) {
          if (subtype === QueryType.posts) {
            console.log('query by oldest posts');
            allPosts.sort((a, b) => a.created_at > b.created_at? 1 : -1);
          } else if (subtype === QueryType.comments) {
            console.log('query by oldest comments');
            allPosts.sort((a, b) => a.updated_at > b.updated_at? 1 : -1);
          }
        }
        tmp = [...allPosts];
        // subtype is comments --> sort comments by time, and get posts of each comment, filter out repeated posts
      }

      let ret: any[] = [];
      for (var i = 0; i < tmp.length; i ++) {
        if (tmp[i].comments.length > 0) {
          const comments = await this.commentIdToObject(tmp[i].comments);
          const singleComment = this.filterOneComment(comments);
          const p = {...tmp[i], comments: [singleComment]};
          ret = [...ret, p];
        } else {
          ret = [...ret, tmp[i]];
        }
        
      }
      return ret;
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
          { transactionHash: tx.hash.toString(), proofIndex: proofIndex },
          { "new": true, "upsert": false }, 
          (err) => console.log('update transaction hash of posts error: ' + err)
        );
      });

      await writeRecord(epochKey, epochKey, 0, DEFAULT_POST_KARMA, epoch, ActionType.post, postId);
      
      return {transaction: tx.hash, postId: newPost._id, currentEpoch: epoch};
    }
  }

  export = new PostController();