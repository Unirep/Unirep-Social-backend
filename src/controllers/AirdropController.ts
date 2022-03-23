import { formatProofForSnarkjsVerification } from '@unirep/circuits'
import { SignUpProof } from '@unirep/contracts'
import {
    UNIREP_SOCIAL_ATTESTER_ID,
    DEFAULT_AIRDROPPED_KARMA,
    unirepContract,
    unirepSocialContract,
} from '../constants'
import { verifyAirdropProof } from './utils'
import TransactionManager from '../daemons/TransactionManager'
import Record from '../models/record'

export const getAirdrop = async (req, res) => {
    const unirepSocialId = UNIREP_SOCIAL_ATTESTER_ID
    const currentEpoch = Number(await unirepContract.currentEpoch())

    // Parse Inputs
    const { publicSignals, proof } = req.body
    const signUpProof = new SignUpProof(
        publicSignals,
        formatProofForSnarkjsVerification(proof)
    )

    const attestingFee = await unirepContract.attestingFee()

    // Verify proof
    const error = await verifyAirdropProof(
        signUpProof,
        Number(unirepSocialId),
        currentEpoch
    )
    if (error !== undefined) {
        res.status(422).json({ error: error, transaction: undefined })
        return
    }

    // submit epoch key to unirep social contract
    const calldata = unirepSocialContract.interface.encodeFunctionData(
        'airdrop',
        [signUpProof as any]
    )
    const hash = await TransactionManager.queueTransaction(
        unirepSocialContract.address,
        {
            data: calldata,
            value: attestingFee,
        }
    )
    await Record.create({
        to: publicSignals[1].toString(16),
        from: 'UnirepSocial',
        upvote: DEFAULT_AIRDROPPED_KARMA,
        downvote: 0,
        epoch: currentEpoch,
        action: 'UST',
        data: '0',
        transactionHash: hash,
        confirmed: false,
    })
    res.json({ transaction: hash })
}

export default {
    getAirdrop,
}
