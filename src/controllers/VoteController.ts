import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts';
import { ethers } from 'ethers'
import {
  UNIREP,
  UNIREP_SOCIAL_ABI,
  UNIREP_ABI,
  UNIREP_SOCIAL,
  DEFAULT_ETH_PROVIDER,
  ActionType,
  UNIREP_SOCIAL_ATTESTER_ID
} from '../constants';
import { IVote } from '../database/models/vote';
import Proof from '../database/models/proof';
import Post from '../database/models/post';
import Comment from '../database/models/comment';
import { verifyReputationProof } from "../controllers/utils"
import { writeRecord } from '../database/utils';
import TransactionManager from '../daemons/TransactionManager'
import Nullifier from '../database/models/nullifiers'

const vote = async (req: any, res: any) => {

    const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
    const currentEpoch = Number(await unirepContract.currentEpoch())


    const { publicSignals, proof } = req.body
    const reputationProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
    const epochKey = BigInt(reputationProof.epochKey.toString()).toString(16)
    const receiver = parseInt(req.body.receiver, 16)
    {
      const exists = await Nullifier.exists({
        nullifier: {
          $in: reputationProof.repNullifiers.map(n => n.toString())
        }
      })
      if (exists) {
        res.status(400).json({
          error: 'Duplicate nullifier',
        })
        return
      }
    }

    const { isPost, dataId } = req.body
    let postProofIndex: number = 0
    if (isPost) {
        const post = await Post.findOne({ transactionHash: dataId })
        if (!post) {
          throw new Error('Post not found')
        }
        if (post.epoch !== currentEpoch) {
            res.status(400).json({
              info: 'The epoch key is expired'
            })
            return
        }
        console.log('find post proof index: ' + post.proofIndex);
        const validProof = await Proof.findOne({ index: post.proofIndex, epoch: currentEpoch, valid: true })
        if (!validProof) {
            res.status(400).json({
              info: 'Voting for invalid post'
            })
            return
        }
        postProofIndex = post.proofIndex;
    } else {
        const comment = await Comment.findOne({ transactionHash: dataId });
        if (!comment) {
            res.status(404).json({
              info: 'Comment not found'
            })
            return
        }
        if (comment.epoch !== currentEpoch) {
            res.status(400).json({
              info: 'Epoch key is expired'
            })
            return
        }
        console.log('find comment proof index: ' + comment.proofIndex);
        const validProof = await Proof.findOne({ index: comment.proofIndex, epoch: currentEpoch, valid: true })
        if (!validProof) {
            res.status(400).json({
              info: 'Voting for invalid comment'
            })
            return
        }
        postProofIndex = comment.proofIndex;
    }

    if (Number(postProofIndex) === 0) {
        res.status(400).json({
          info: 'Cannot find post proof index'
        })
        return
    }

    const error = await verifyReputationProof(
        reputationProof,
        req.body.upvote + req.body.downvote,
        unirepSocialId,
        currentEpoch
    )
    if (error !== undefined) {
        throw error
    }

    console.log(`Attesting to epoch key ${req.body.receiver} with pos rep ${req.body.upvote}, neg rep ${req.body.downvote}`)

    console.log('post proof index', postProofIndex)

    const attestingFee = await unirepContract.attestingFee()
    const calldata = unirepSocialContract.interface.encodeFunctionData('vote', [
      req.body.upvote,
      req.body.downvote,
      receiver,
      postProofIndex,
      reputationProof,
    ])
    const hash = await TransactionManager.queueTransaction(
      unirepSocialContract.address,
      {
        data: calldata,
        // TODO: make this more clear?
        // 2 attestation calls into unirep: https://github.com/Unirep/Unirep-Social/blob/alpha/contracts/UnirepSocial.sol#L200
        value: attestingFee.mul(2),
      }
    )
    // save to db data
    const newVote: IVote = {
        transactionHash: hash,
        epoch: currentEpoch,
        voter: epochKey,
        posRep: req.body.upvote,
        negRep: req.body.downvote,
        graffiti: "0",
        overwriteGraffiti: false,
    };

    if (isPost) {
        await Post.findOneAndUpdate(
            { transactionHash: dataId },
            { "$push": { "votes": newVote },
              "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false }
        )

        await writeRecord(
            req.body.receiver,
            epochKey,
            req.body.upvote,
            req.body.downvote,
            currentEpoch,
            ActionType.Vote,
            hash,
            dataId
        );
    } else {
        const comment = await Comment.findOneAndUpdate(
            { transactionHash: dataId },
            { "$push": { "votes": newVote },
            "$inc": { "posRep": newVote.posRep, "negRep": newVote.negRep } },
            { "new": true, "upsert": false }
        )
        if (comment !== undefined && comment !== null) {
            await writeRecord(
                req.body.receiver,
                epochKey,
                req.body.upvote,
                req.body.downvote,
                currentEpoch,
                ActionType.Vote,
                hash,
                dataId
            );
        }
    }
  res.json({
    transaction: hash
  })
}

export default {
  vote,
}
