import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { SignUpProof } from '@unirep/contracts'

import ErrorHandler from '../ErrorHandler';
import {
    UNIREP_SOCIAL,
    DEFAULT_ETH_PROVIDER,
    UNIREP_SOCIAL_ATTESTER_ID,
    UNIREP,
    UNIREP_ABI,
    UNIREP_SOCIAL_ABI,
  } from '../constants';
import { decodeSignUpProof, verifyAirdropProof } from './utils';
import { ethers } from 'ethers'
import TransactionManager from '../TransactionManager'


class AirdropController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    getAirdrop = async (data: any) => {
        // Unirep Social contract
        const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
        const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
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

        // submit epoch key to unirep social contract
        const calldata = unirepSocialContract.interface.encodeFunctionData('airdrop', [signUpProof])
        const hash = await TransactionManager.queueTransaction(calldata)
        return { transaction: hash }
    }
}

export = new AirdropController();
