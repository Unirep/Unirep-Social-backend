import { formatProofForSnarkjsVerification } from '@unirep/circuits';
import { SignUpProof } from '@unirep/contracts'

import {
    UNIREP_SOCIAL,
    DEFAULT_ETH_PROVIDER,
    UNIREP_SOCIAL_ATTESTER_ID,
    UNIREP,
    UNIREP_ABI,
    UNIREP_SOCIAL_ABI,
} from '../constants';
import { verifyAirdropProof } from './utils';
import { ethers } from 'ethers'
import TransactionManager from '../daemons/TransactionManager'


export const getAirdrop = async (req, res) => {
    // Unirep Social contract
    const unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER)
    const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
    const currentEpoch = Number(await unirepContract.currentEpoch())

    // Parse Inputs
    const { publicSignals, proof } = req.body
    const signUpProof = new SignUpProof(publicSignals, formatProofForSnarkjsVerification(proof))

    const attestingFee = await unirepContract.attestingFee()

    // Verify proof
    const error = await verifyAirdropProof(signUpProof, Number(unirepSocialId), currentEpoch)
    if (error !== undefined) {
        res.json({ error: error, transaction: undefined })
        return
    }

    // submit epoch key to unirep social contract
    const calldata = unirepSocialContract.interface.encodeFunctionData('airdrop', [signUpProof])
    const hash = await TransactionManager.queueTransaction(unirepSocialContract.address, {
        data: calldata,
        value: attestingFee,
    })
    res.json({ transaction: hash })
}

export default {
    getAirdrop,
}
