import ErrorHandler from '../ErrorHandler';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, add0x } from '../constants';
import { ethers } from 'ethers';

class USTController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    userStateTransition = async (d: any) => {
        // const data = JSON.parse(JSON.stringify(d), (key, value) => {
        //     if (typeof value === 'string' && /^\d+n$/.test(value)) {
        //       return BigInt(value.substr(0, value.length - 1))
        //     }
        //     return value
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
        // let tx
        // try {
        //     tx = await unirepSocialContract.updateUserStateRoot(
        //         data.newGSTLeaf,
        //         data.outputAttestationNullifiers,
        //         data.outputEPKNullifiers,
        //         data.fromEpoch,
        //         data.GSTreeRoot,
        //         data.epochTreeRoot,
        //         data.nullifierTreeRoot,
        //         data.proof,
        //     )
        // } catch(e: any) {
        //     console.error('Error: the transaction failed')
        //     if (e.message) {
        //         console.error(e.message)
        //     }
        //     return
        // }

        // console.log('Transaction hash:', tx.hash)
        // console.log(`User transitioned from epoch ${data.fromEpoch} to epoch ${currentEpoch}`)  
        // return {transaction: tx.hash, currentEpoch: Number(currentEpoch)}
    }
  }

  export = new USTController();