import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER } from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { verifyUSTProof } from './utils';
import { updateGSTLeaf } from '../database/utils';
import { IGSTLeaf } from '../database/models/GSTLeaf';

class USTController {
    defaultMethod() {
        throw new ErrorHandler(501, 'API: Not implemented method');
    }

    userStateTransition = async (data: any) => {
        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
        await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
        const currentEpoch = Number(await unirepSocialContract.currentEpoch())
        const results = data.results;

        const error = await verifyUSTProof(results, currentEpoch)
        if(error !== undefined) return {error, transactionHash: undefined}

        // submit user state transition proofs
        let txHash
        try {
            const txList = await unirepSocialContract.userStateTransition(results)
            txHash = txList[txList?.length - 1]?.hash
        } catch(e) {
            return {error: e, transaction: txHash}
        }

        if(txHash !== undefined){
            console.log('Transaction hash:', txHash)
            // save GST leaf before gen airdrop proof
            const newLeaf: IGSTLeaf = {
                transactionHash: txHash,
                hashedLeaf: results.finalTransitionProof.newGlobalStateTreeLeaf
            }
            await updateGSTLeaf(newLeaf, currentEpoch)
        }

        return {transaction: txHash}
    }
}

export = new USTController();