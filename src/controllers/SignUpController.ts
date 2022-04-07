import { ethers } from 'ethers'
import {
    UNIREP,
    UNIREP_ABI,
    DEFAULT_ETH_PROVIDER,
    UNIREP_SOCIAL,
    UNIREP_SOCIAL_ABI,
} from '../constants'
import TransactionManager from '../daemons/TransactionManager'
import InvitationCode from '../models/invitationCode'

const signUp = async (req: any, res: any) => {
    const uploadedCommitment = req.query.commitment!.toString()
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        DEFAULT_ETH_PROVIDER
    )
    const unirepSocialContract = new ethers.Contract(
        UNIREP_SOCIAL,
        UNIREP_SOCIAL_ABI,
        DEFAULT_ETH_PROVIDER
    )

    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(uploadedCommitment)) {
        res.status(400).json({
            error: 'Commitment must be exactly 64 hex characters with an optional 0x prefix',
        })
        return
    }
    const commitment = `0x${uploadedCommitment.replace('0x', '')}`

    const calldata = unirepSocialContract.interface.encodeFunctionData(
        'userSignUp',
        [commitment]
    )
    const hash = await TransactionManager.queueTransaction(
        unirepSocialContract.address,
        calldata
    )

    const epoch = await unirepContract.currentEpoch()
    console.log('transaction: ' + hash + ', sign up epoch: ' + epoch.toString())

    const code = req.query.invitationCode.toString()
    InvitationCode.findOneAndDelete({ code }, (err, c) => {
        if (err) {
            console.log('query invitation code and delete error: ' + err)
        } else {
            console.log('invitation code deleted: ' + c)
        }
    })

    res.json({
        transaction: hash,
        epoch: epoch.toNumber(),
    })
}

// const signUpUnirepUser = async (data: any) => {
//   // Unirep Social contract
//   const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)

//   // Parse Inputs
//   const decodedProof = data.proof
//   const decodedPublicSignals = data.publicSignals
//   const epoch = publicSignals[0]
//   const epk = publicSignals[1]
//   const GSTRoot = publicSignals[2]
//   const attesterId = publicSignals[3]
//   const userHasSignedUp = publicSignals[4]
//   const proof = JSON.parse(decodedProof)

//   console.log('in airdrop controller:')
//   console.log(publicSignals)
//   console.log(proof)
//   console.log('end in airdrop controller.')

//   // Verify proof
//   // Check if attester ID matches Unirep Social
//   const _attesterId = UNIREP_SOCIAL_ATTESTER_ID
//   if(_attesterId != Number(attesterId)) {
//       console.error('Error: invalid attester ID proof')
//       return
//   }

//   // Check if user has not signed up in Unirep Social
//   if(Number(userHasSignedUp) === 1) {
//       console.error('Error: user has already signed up in Unirep Social')
//       return
//   }

//   // Check if Global state tree root exists
//   const validRoot = await GSTRootExists(Number(epoch), GSTRoot)
//   if(!validRoot){
//       console.error(`Error: invalid global state tree root ${GSTRoot}`)
//       return
//   }

//   // Verify the proof on-chain
//   const isProofValid = await unirepSocialContract.verifyUserSignUp(
//       publicSignals,
//       proof,
//   )
//   if (!isProofValid) {
//       console.error('Error: invalid user sign up proof')
//       return
//   }

//   // Connect a signer
//   await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY)
//   // submit epoch key to unirep social contract
//   const tx = await unirepSocialContract.userSignUpWithProof(publicSignals, proof)

//   if(tx != undefined){
//       console.log(`The user of epoch key ${epk} will get airdrop in the next epoch`)
//       console.log('Transaction hash:', tx?.hash)
//   }
//   return {transaction: tx.hash}
// }

export default {
    signUp,
}
