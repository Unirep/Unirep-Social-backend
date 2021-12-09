import base64url from 'base64url';

import ErrorHandler from '../ErrorHandler';
import { DEFAULT_ETH_PROVIDER, DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, identityCommitmentPrefix, add0x, signUpProofPrefix, signUpPublicSignalsPrefix, UNIREP_SOCIAL_ATTESTER_ID } from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { GSTRootExists } from './utils';

class SignUpController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    signUp = async (uploadedCommitment: string, epk: string) => {
      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER);
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY);

      const encodedCommitment = uploadedCommitment.slice(identityCommitmentPrefix.length);
      const decodedCommitment = base64url.decode(encodedCommitment);
      const commitment = add0x(decodedCommitment);
      console.log(commitment);

      const tx = await unirepSocialContract.userSignUp(commitment);
      const epoch = await unirepSocialContract.currentEpoch();
      console.log('transaction: ' + tx.hash + ', sign up epoch: ' + epoch.toString());

      return {transaction: tx.hash, epoch: epoch.toNumber()};
    }

    signUpUnirepUser = async (data: any) => {
      // Unirep Social contract
      const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)

      // Parse Inputs
      const decodedProof = base64url.decode(data.proof.slice(signUpProofPrefix.length))
      const decodedPublicSignals = base64url.decode(data.publicSignals.slice(signUpPublicSignalsPrefix.length))
      const publicSignals = JSON.parse(decodedPublicSignals)
      const epoch = publicSignals[0]
      const epk = publicSignals[1]
      const GSTRoot = publicSignals[2]
      const attesterId = publicSignals[3]
      const userHasSignedUp = publicSignals[4]
      const proof = JSON.parse(decodedProof)

      console.log('in airdrop controller:')
      console.log(publicSignals)
      console.log(proof)
      console.log('end in airdrop controller.')

      // Verify proof
      // Check if attester ID matches Unirep Social
      const _attesterId = UNIREP_SOCIAL_ATTESTER_ID
      if(_attesterId != Number(attesterId)) {
          console.error('Error: invalid attester ID proof')
          return
      }

      // Check if user has not signed up in Unirep Social
      if(Number(userHasSignedUp) === 1) {
          console.error('Error: user has already signed up in Unirep Social')
          return
      }

      // Check if Global state tree root exists
      const validRoot = await GSTRootExists(Number(epoch), GSTRoot)
      if(!validRoot){
          console.error(`Error: invalid global state tree root ${GSTRoot}`)
          return
      }

      // Verify the proof on-chain
      const isProofValid = await unirepSocialContract.verifyUserSignUp(
          publicSignals,
          proof,
      )
      if (!isProofValid) {
          console.error('Error: invalid user sign up proof')
          return
      }

      // Connect a signer
      await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY)
      // submit epoch key to unirep social contract
      const tx = await unirepSocialContract.userSignUpWithProof(publicSignals, proof)

      if(tx != undefined){
          console.log(`The user of epoch key ${epk} will get airdrop in the next epoch`)
          console.log('Transaction hash:', tx?.hash)
      }
      return {transaction: tx.hash}
    }
  }

  export = new SignUpController();