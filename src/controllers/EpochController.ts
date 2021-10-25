import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';

class EpochController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    epochTransition = async () => {
        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
        const unirepContract = await unirepSocialContract.getUnirep()
        await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);
        
        await unirepSocialContract.fastForward()
        const currentEpoch = await unirepContract.currentEpoch()
        const tx = await unirepSocialContract.epochTransition()

        console.log('Transaction hash:', tx.hash)
        console.log('End of epoch:', currentEpoch.toString())

        global.nextEpochTransition = Date.now() + global.epochPeriod
        console.log(global.nextEpochTransition)

        return
    }
  }

  export = new EpochController();