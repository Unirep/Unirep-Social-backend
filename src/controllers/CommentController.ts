import ErrorHandler from '../ErrorHandler';
import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts'
import { UnirepSocialContract } from '@unirep/unirep-social';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, DEFAULT_COMMENT_KARMA, UNIREP_SOCIAL_ATTESTER_ID } from '../constants';
import Comment, { IComment } from "../database/models/comment";
import { decodeReputationProof, verifyReputationProof } from "../controllers/utils"

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    leaveComment = async (data: any) => {
        console.log(data);

        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
        await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
        const unirepContract = await unirepSocialContract.getUnirep()
        const currentEpoch = Number(await unirepContract.currentEpoch())

        // Parse Inputs
        const { publicSignals, proof } = decodeReputationProof(data.proof, data.publicSignals)
        const reputationProof = new ReputationProof(publicSignals, formatProofForSnarkjsVerification(proof))
        const epochKey = BigInt(reputationProof.epochKey.toString()).toString(16)
        const minRep = Number(reputationProof.minRep)
      
        let error

        error = await verifyReputationProof(
            reputationProof, 
            DEFAULT_COMMENT_KARMA, 
            unirepSocialId, 
            currentEpoch
        )
        if (error !== undefined) {
            return {error: error, transaction: undefined, postId: undefined, currentEpoch: currentEpoch};
        } 

        let tx
        try {
            tx = await unirepSocialContract.leaveComment(
                reputationProof,
                data.postId,
                data.content,
            );

            const newComment: IComment = new Comment({
                postId: data.postId,
                content: data.content, // TODO: hashedContent
                epochKey: epochKey,
                epoch: currentEpoch,
                proveMinRep: minRep !== 0 ? true : false,
                minRep: Number(minRep),
                posRep: 0,
                negRep: 0,
                status: 0,
                transactionHash: tx.hash
            });
  
            await newComment.save((err, comment) => {
                console.log('new comment error: ' + err);
                error = err
            });

            return {error: error, transaction: tx.hash, currentEpoch: currentEpoch}
        } catch(e) {
            return {error: e}
        }
    }
}

export = new CommentController();