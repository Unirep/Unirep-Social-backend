import base64url from 'base64url';
import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { SignUpProof } from '@unirep/contracts'
import { UnirepSocialContract } from '@unirep/unirep-social';

import ErrorHandler from '../ErrorHandler';
import { 
    signUpProofPrefix,
    signUpPublicSignalsPrefix,
    DEPLOYER_PRIV_KEY, 
    UNIREP_SOCIAL, 
    DEFAULT_ETH_PROVIDER,  
    UNIREP_SOCIAL_ATTESTER_ID} from '../constants';
import { verifyAirdropProof } from './utils';


class AirdropController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    getAirdrop = async (data: any) => {
        // Unirep Social contract
        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
        const unirepContract = await unirepSocialContract.getUnirep()
        const currentEpoch = Number(await unirepContract.currentEpoch())

        // Parse Inputs
        const decodedProof = base64url.decode(data.proof.slice(signUpProofPrefix.length))
        const decodedPublicSignals = base64url.decode(data.publicSignals.slice(signUpPublicSignalsPrefix.length))
        const publicSignals = JSON.parse(decodedPublicSignals)
        const proof = JSON.parse(decodedProof)
        const signUpProof = new SignUpProof(publicSignals, formatProofForSnarkjsVerification(proof))

        console.log('in airdrop controller:')
        console.log(signUpProof)
        console.log('end in airdrop controller.')

        // Verify proof
        const error = await verifyAirdropProof(signUpProof, Number(unirepSocialId), currentEpoch)
        if (error !== undefined) {
            return {error: error, transaction: undefined};
        }

        // Connect a signer
        await unirepSocialContract.unlock(DEPLOYER_PRIV_KEY)
        // submit epoch key to unirep social contract
        let tx
        try {
            tx = await unirepSocialContract.airdrop(signUpProof)
        } catch(e) {
            return {error: e, transaction: tx?.hash}
        }

        if(tx != undefined){
            console.log(`The user of epoch key ${signUpProof.epochKey.toString(16)} will get airdrop in the next epoch`)
            console.log('Transaction hash:', tx?.hash)
        }
        return {transaction: tx.hash}
    }
}

export = new AirdropController();