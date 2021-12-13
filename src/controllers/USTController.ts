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
      const currentEpoch = await unirepSocialContract.currentEpoch()
      const results = data.results;

      const error = await verifyUSTProof(results)
      if(error !== undefined) return {error, transactionHash: undefined}

      // submit user state transition proofs
      const txList = await unirepSocialContract.userStateTransition(results)

      if(txList[0] != undefined){
          console.log('Transaction hash:', txList[txList.length - 1]?.hash)
          // save GST leaf before gen airdrop proof
          const newLeaf: IGSTLeaf = {
            transactionHash: txList[txList.length - 1]?.hash,
            hashedLeaf: results.finalTransitionProof.newGlobalStateTreeLeaf
          }
          await updateGSTLeaf(newLeaf, Number(currentEpoch))
      }

      return {transaction: txList[txList.length - 1]?.hash}
    }
  }

  export = new USTController();