import base64url from 'base64url';

import ErrorHandler from '../ErrorHandler';
import { DEFAULT_ETH_PROVIDER, DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, identityCommitmentPrefix, add0x } from '../constants';
import { ethers } from 'ethers';
import UnirepSocial from '../artifacts/contracts/UnirepSocial.sol/UnirepSocial.json'

class SignInController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    signIn = async (uploadedCommitment: string) => {
      // user sign up
      const provider = new ethers.providers.JsonRpcProvider(DEFAULT_ETH_PROVIDER)
      const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, provider)

      const unirepSocialContract = new ethers.Contract(
          UNIREP_SOCIAL,
          UnirepSocial.abi,
          wallet,
      )
    
      const encodedCommitment = uploadedCommitment.slice(identityCommitmentPrefix.length)
      const decodedCommitment = base64url.decode(encodedCommitment)
      const commitment = add0x(decodedCommitment)
      console.log(commitment)

      let tx
      let isSuccess
      try {
        tx = await unirepSocialContract.userSignUp(
            commitment,
            { gasLimit: 1000000 }
        )
        const receipt = await tx.wait()
        const epoch = unirepSocialContract.interface.parseLog(receipt.logs[2]).args._epoch
        console.log('Sign up Transaction hash:', tx.hash)
        console.log('Sign up epoch:', epoch.toString())
      } catch (e: any) {
        if (e.message.includes('user has already signed up')) {
            isSuccess = true
        } else {
            console.error('Error: the transaction failed')
            if (e.message) {
                console.error(e.message)
            }
            isSuccess = false
        }
      }

      return isSuccess;
    }
  }

  export = new SignInController();