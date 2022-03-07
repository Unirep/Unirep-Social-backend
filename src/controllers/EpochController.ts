import ErrorHandler from '../ErrorHandler';
import { ethers } from 'ethers'
import {
  UNIREP_ABI,
  UNIREP,
  DEFAULT_ETH_PROVIDER,
} from '../constants';
import TransactionManager from '../TransactionManager'

class EpochController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    epochTransition = async () => {
        const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)

        const calldata = unirepContract.interface.encodeFunctionData('beginEpochTransition', [])
        const hash = await TransactionManager.queueTransaction(unirepContract.address, calldata)
        return hash
    }
}

export = new EpochController();
