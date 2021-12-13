import base64url from 'base64url';

import ErrorHandler from '../ErrorHandler';
import { 
    signUpProofPrefix,
    signUpPublicSignalsPrefix,
    DEPLOYER_PRIV_KEY, 
    UNIREP_SOCIAL, 
    DEFAULT_ETH_PROVIDER,  
    UNIREP_SOCIAL_ATTESTER_ID} from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { verifyAirdropProof } from './utils';

class AirdropController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    getAirdrop = async (data: any) => {
        // Unirep Social contract
        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID

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
        const error = await verifyAirdropProof(publicSignals, proof, Number(unirepSocialId))
        if (error !== undefined) {
            return {error: error, transaction: undefined};
        }

        // Connect a signer
        await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY)
        // submit epoch key to unirep social contract
        const tx = await unirepSocialContract.airdrop(publicSignals, proof)

        if(tx != undefined){
            console.log(`The user of epoch key ${epk} will get airdrop in the next epoch`)
            console.log('Transaction hash:', tx?.hash)
        }
        return {transaction: tx.hash}
    }
  }

  export = new AirdropController();