import { DEFAULT_ETH_PROVIDER, DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, add0x } from '../constants';
import { ethers } from 'ethers';
// import UnirepSocial from '../artifacts/contracts/UnirepSocial.sol/UnirepSocial.json'

const signIn = async (uploadedCommitment: string) => {
    // user sign up
    // const provider = new ethers.providers.WebSocketProvider(DEFAULT_ETH_PROVIDER)
    // const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, provider)

    // const unirepSocialContract = new ethers.Contract(
    //     UNIREP_SOCIAL,
    //     UnirepSocial.abi,
    //     wallet,
    // )

    // const decodedCommitment = uploadedCommitment
    // const commitment = add0x(decodedCommitment)
    // console.log(commitment)

    // let tx
    // let isSuccess
    // try {
    //   tx = await unirepSocialContract.userSignUp(
    //       commitment,
    //       { gasLimit: 1000000 }
    //   )
    //   const receipt = await tx.wait()
    //   const epoch = unirepSocialContract.interface.parseLog(receipt.logs[2]).args._epoch
    //   console.log('Sign up Transaction hash:', tx.hash)
    //   console.log('Sign up epoch:', epoch.toString())
    // } catch (e: any) {
    //   if (e.message.includes('user has already signed up')) {
    //       isSuccess = true
    //   } else {
    //       console.error('Error: the transaction failed')
    //       if (e.message) {
    //           console.error(e.message)
    //       }
    //       isSuccess = false
    //   }
    // }

    // return isSuccess;
}

export default {
    signIn,
}
