import ErrorHandler from '../ErrorHandler';
import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { ReputationProof } from '@unirep/contracts'
import { UnirepSocialContract } from '@unirep/unirep-social';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, DEFAULT_COMMENT_KARMA, UNIREP_SOCIAL_ATTESTER_ID, QueryType, loadPostCount } from '../constants';
import Comment, { IComment } from "../database/models/comment";
import { decodeReputationProof, verifyReputationProof } from "../controllers/utils"

class CommentController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    listAllComments = () => {
        const allComments = Comment.find({}).then(async(comments) => {
            let ret: any[] = [];
            for (var i = 0; i < comments.length; i ++) {
                ret = [...ret, comments[i].toObject()];
            }
            return ret;
        });
        return allComments;
    }

    getCommentsWithEpks = async (epks: string[]) => {
        return Comment.find({epochKey: {$in: epks}});
    }

    getCommentsWithQuery = async (query: string, lastRead: string, epks: string[]) => {
        let allComments: any[] = [];
        if (epks.length === 0) {
          allComments = await this.listAllComments();
        } else {
          allComments = await this.getCommentsWithEpks(epks);
        }
        allComments.sort((a, b) => a.created_at > b.created_at? -1 : 1);
        if (query === QueryType.New) {
            // allPosts.sort((a, b) => a.created_at > b.created_at? -1 : 1);
        } else if (query === QueryType.Boost) {
          allComments.sort((a, b) => a.posRep > b.posRep? -1 : 1);
        } else if (query === QueryType.Squash) {
          allComments.sort((a, b) => a.negRep > b.negRep? -1 : 1); 
        } else if (query === QueryType.Rep) {
          allComments.sort((a, b) => (a.posRep - a.negRep) >= (b.posRep - b.negRep)? -1 : 1); 
        }

        // console.log(allComments);

        // filter out posts more than loadPostCount
        if (lastRead === '0') {
            return allComments.slice(0, Math.min(loadPostCount, allComments.length));
        } else {
            let index : number = -1;
            allComments.forEach((p, i) => {
                if (p.transactionHash === lastRead) {
                    index = i;
                }
            });
            if (index > -1) {
                return allComments.slice(index+1, Math.min(allComments.length, index + 1 + loadPostCount));
            } else {
                return allComments.slice(0, loadPostCount);
            }
        }
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
            const receipt = await tx.wait()
            if (receipt.state === 0) {
                return { error: "Transaction reverted", transaction: tx.hash, currentEpoch: currentEpoch }
            }

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
        } catch(error) {
            if (JSON.stringify(error).includes('replacement fee too low')) {
                return await this.leaveComment(data);
            }
            return { error }
        }
    }
}

export = new CommentController();