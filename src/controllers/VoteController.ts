import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import { ethers } from 'ethers';
import { Attestation } from '../database/models/attestation';
import { IVote } from '../database/models/vote';
import Post from '../database/models/post';
import Comment from '../database/models/comment';

class VoteController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    vote = async (d: any) => {
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
      // const currentEpoch = await unirepContract.currentEpoch()

      // const attestingFee = await unirepContract.attestingFee()
      // const attesterId = await unirepContract.attesters(UNIREP_SOCIAL)
      // console.log(attesterId)
      // if (attesterId.toNumber() == 0) {
      //   console.error('Error: attester has not registered yet')
      //   return
      // }

      // // upvote or downvote to epoch key
      // const attestationToEpochKey = new Attestation(
      //   BigInt(attesterId),
      //   BigInt(data.upvote),
      //   BigInt(data.downvote),
      //   data.graffiti,
      //   data.overwriteGraffiti,
      // )

      // // Sign the message
      // const message = ethers.utils.solidityKeccak256(["address", "address"], [wallet.address, unirepAddress])

      // // set vote fee
      // const voteFee = attestingFee.mul(2)

      // console.log(`Attesting to epoch key ${data.receiver} with pos rep ${data.upvote}, neg rep ${data.downvote} and graffiti ${data.graffiti.toString(16)} (overwrite graffit: ${data.overwriteGraffiti})`)
      // let tx
      // try {
      //     tx = await unirepSocialContract.vote(
      //         attestationToEpochKey,
      //         BigInt(add0x(data.receiver)),
      //         BigInt(add0x(data.epk)),
      //         data.nullifiers,
      //         data.publicSignals,
      //         data.proof,
      //         { value: voteFee, gasLimit: 3000000 }
      //     )
      // } catch(e: any) {
      //     console.error('Error: the transaction failed')
      //     if (e.message) {
      //         console.error(e.message)
      //     }
      //     return
      // }

      // // save to db data
      // const newVote: IVote = {
      //   transactionHash: tx.hash.toString(),
      //   epoch: currentEpoch.toNumber(),
      //   attester: data.epk,
      //   posRep: data.upvote,
      //   negRep: data.downvote,
      //   graffiti: data.graffiti.toString(),
      //   overwriteGraffiti: data.overwriteGraffiti,
      // };

      // if (data.isPost) {
      //   Post.findByIdAndUpdate(
      //     data.postId, 
      //     { "$push": { "votes": newVote } },
      //     { "new": true, "upsert": false }, 
      //     (err) => console.log('update votes of post error: ' + err));
      // } else {
      //   Comment.findByIdAndUpdate(
      //     data.postId, 
      //     { "$push": { "votes": newVote } },
      //     { "new": true, "upsert": false }, 
      //     (err) => console.log('update votes of comment error: ' + err));
      // }
      

      // return {transaction: tx.hash};
    }
  }

  export = new VoteController();