import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { verifyProof } from '@unirep/circuits'
import { epochTreeRootExists } from '../database/utils';

class USTController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    userStateTransition = async (data: any) => {
      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
      const results = data.results;

      // Start user state transition proof
      let isValid = await verifyProof('startTransition', results.startTransitionProof.proof, results.startTransitionProof.publicSignals)
      if (!isValid) {
          console.error('Error: start state transition proof generated is not valid!')
          return
      }

      // Process attestations proofs
      for (let i = 0; i < results.processAttestationProofs.length; i++) {
          const isValid = await verifyProof('processAttestations', results.processAttestationProofs[i].proof, results.processAttestationProofs[i].publicSignals)
          if (!isValid) {
              console.error('Error: process attestations proof generated is not valid!')
              return
          }
      }

      // User state transition proof
      isValid = await verifyProof('userStateTransition', results.finalTransitionProof.proof, results.finalTransitionProof.publicSignals)
      if (!isValid) {
          console.error('Error: user state transition proof generated is not valid!')
          return
      }

      // Check epoch tree root
      const epoch = Number(results.finalTransitionProof.transitionedFromEpoch)
      const epochTreeRoot = results.finalTransitionProof.fromEpochTree
      const isEpochTreeExisted = await epochTreeRootExists(epoch, epochTreeRoot)
      if(!isEpochTreeExisted){
          console.log('Epoch tree root mismatches')
          return
      }

      // submit user state transition proofs
      const txList = await unirepSocialContract.userStateTransition(results)

      if(txList[0] != undefined){
          console.log('Transaction hash:', txList[txList.length - 1]?.hash)
      }

      return {transaction: txList[txList.length - 1]?.hash}
    }
  }

  export = new USTController();