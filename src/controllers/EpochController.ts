import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import Unirep from "../artifacts/contracts/Unirep.sol/Unirep.json";
import UnirepSocial from '../artifacts/contracts/UnirepSocial.sol/UnirepSocial.json';
import { ethers } from 'ethers';

class EpochController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    epochTransition = async () => {
        const provider = new ethers.providers.JsonRpcProvider(DEFAULT_ETH_PROVIDER)
        const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, provider)
        const unirepSocialContract = new ethers.Contract(
            UNIREP_SOCIAL,
            UnirepSocial.abi,
            wallet,
        )
        const unirepAddress = await unirepSocialContract.unirep()
        const unirepContract = new ethers.Contract(
            unirepAddress,
            Unirep.abi,
            provider,
        )

        const currentEpoch = await unirepContract.currentEpoch()
        let tx
        try {
            const numEpochKeysToSeal = await unirepContract.getNumEpochKey(currentEpoch)
            tx = await unirepSocialContract.beginEpochTransition(
                numEpochKeysToSeal,
                { gasLimit: 9000000 }
            )

        } catch(e: any) {
            console.error('Error: the transaction failed')
            if (e.message) {
                console.error(e.message)
            }
            return
        }

        console.log('Transaction hash:', tx.hash)
        console.log('End of epoch:', currentEpoch.toString())

        global.nextEpochTransition = Date.now() + global.epochPeriod

        return
    }
  }

  export = new EpochController();