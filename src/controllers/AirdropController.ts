import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { SignUpProof } from '@unirep/contracts'
import { UnirepSocialContract } from '@unirep/unirep-social';

import ErrorHandler from '../ErrorHandler';
import { 
    DEPLOYER_PRIV_KEY, 
    UNIREP_SOCIAL, 
    DEFAULT_ETH_PROVIDER,  
    UNIREP_SOCIAL_ATTESTER_ID} from '../constants';
import { decodeSignUpProof, verifyAirdropProof } from './utils';


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
        const { publicSignals, proof } = decodeSignUpProof(data.proof, data.publicSignals)
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
        try {
            const tx = await unirepSocialContract.airdrop(signUpProof)
            const receipt = await tx.wait()
            if (receipt.status)
                return { transaction: tx.hash }
            else 
                return { error: "Transaction reverted", transaction: tx.hash }
        } catch(error) {
            if (JSON.stringify(error).includes('replacement fee too low')) {
                return await this.getAirdrop(data);
            }
            return { error }
        }
    }
}

export = new AirdropController();