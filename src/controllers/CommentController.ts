import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import { ethers } from 'ethers';
import Comment, { IComment } from "../database/models/comment";
import Post from '../database/models/post';

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    leaveComment = async (d: any) => {
      // decode data from d
      // const data = JSON.parse(JSON.stringify(d), (key, value) => {
      //   if (typeof value === 'string' && /^\d+n$/.test(value)) {
      //     return BigInt(value.substr(0, value.length - 1))
      //   }
      //   return value
      // });
      
      // const provider = new ethers.providers.JsonRpcProvider(DEFAULT_ETH_PROVIDER)
      // const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, provider)
      // const unirepSocialContract = new ethers.Contract(
      //     UNIREP_SOCIAL,
      //     UnirepSocial.abi,
      //     wallet,
      // )
      // const unirepAddress = await unirepSocialContract.unirep()
      // const unirepContract = new ethers.Contract(
      //     unirepAddress,
      //     Unirep.abi,
      //     provider,
      // )

      // const attestingFee = await unirepContract.attestingFee()
      // const currentEpoch = await unirepContract.currentEpoch()

      // const newComment: IComment = new Comment({
      //   postId: data.postId,
      //   content: data.content, // TODO: hashedContent
      //   epochKey: data.epk,
      //   epoch: currentEpoch,
      //   epkProof: data.proof.map((n)=>add0x(BigInt(n).toString(16))),
      //   proveMinRep: data.minRep !== 0 ? true : false,
      //   minRep: Number(data.minRep),
      //   posRep: 0,
      //   negRep: 0,
      //   status: 0
      // });

      // let tx
      // try {
      //     tx = await unirepSocialContract.leaveComment(
      //         BigInt(add0x(data.postId)),
      //         BigInt(add0x(newComment._id.toString())), 
      //         BigInt(add0x(data.epk)),
      //         data.content,
      //         data.nullifiers,
      //         data.publicSignals, 
      //         data.proof,
      //         { value: attestingFee, gasLimit: 1000000 }
      //     )
      // } catch(e: any) {
      //     console.error('Error: the transaction failed')
      //     if (e.message) {
      //         console.error(e.message)
      //     }
      //     return
      // }

      // await newComment.save((err, comment) => {
      //   console.log('new comment error: ' + err);
      //   Comment.findByIdAndUpdate(
      //     comment._id.toString(),
      //     { transactionHash: tx.hash.toString() },
      //     { "new": true, "upsert": false }, 
      //     (err) => console.log('update transaction hash of comments error: ' + err)
      //   );
      // });

      // Post.findByIdAndUpdate(
      //   data.postId, 
      //   { "$push": { "comments": newComment._id.toString() } },
      //   { "new": true, "upsert": true }, 
      //   (err) => console.log('update comments of post error: ' + err));

      // return {transaction: tx.hash, commentId: newComment._id.toString(), currentEpoch: Number(currentEpoch)}
    }
  }

  export = new CommentController();