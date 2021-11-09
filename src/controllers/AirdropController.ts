import base64url from 'base64url';

import ErrorHandler from '../ErrorHandler';
import { 
    signUpProofPrefix,
    signUpPublicSignalsPrefix,
    DEPLOYER_PRIV_KEY, 
    UNIREP_SOCIAL, 
    DEFAULT_ETH_PROVIDER,  
    DEFAULT_START_BLOCK,
    DEFAULT_AIRDROPPED_KARMA } from '../constants';
import { ethers } from 'ethers';
import { UnirepSocialContract } from '@unirep/unirep-social';
import { genUnirepStateFromContract } from '@unirep/unirep';
import Record, { IRecord } from '../database/models/record';
import { GSTRootExists } from './utils';

class AirdropController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    getAirdrop = async (data: any) => {
        // Ethereum provider
        const provider = new ethers.providers.JsonRpcProvider(DEFAULT_ETH_PROVIDER)

        // Unirep Social contract
        const unirepSocialContract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)
        // Unirep contract
        const unirepContract = await unirepSocialContract.getUnirep()

        const unirepState = await genUnirepStateFromContract(
            provider,
            unirepContract.address,
            DEFAULT_START_BLOCK,
        )

        // Parse Inputs
        const decodedProof = base64url.decode(data.proof.slice(signUpProofPrefix.length))
        const decodedPublicSignals = base64url.decode(data.publicSignals.slice(signUpPublicSignalsPrefix.length))
        const publicSignals = JSON.parse(decodedPublicSignals)
        const epoch = publicSignals[0]
        const epk = publicSignals[1]
        const GSTRoot = publicSignals[2]
        const attesterId = publicSignals[3]
        const proof = JSON.parse(decodedProof)

        console.log('in airdrop controller:')
        console.log(publicSignals)
        console.log(proof)
        console.log('end in airdrop controller.')

        // Verify proof
        // Check if attester ID matches Unirep Social
        const _attesterId = await unirepSocialContract.attesterId()
        if(_attesterId.toNumber() != attesterId) {
            console.error('Error: invalid attester ID proof')
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
        const tx = await unirepSocialContract.airdrop(publicSignals, proof)

        if(tx != undefined){
            console.log(`The user of epoch key ${epk} will get airdrop in the next epoch`)
            console.log('Transaction hash:', tx?.hash)
        }

        const newRecord: IRecord = new Record({
            to: Number(epk).toString(16),
            from: 'UnirepSocial',
            upvote: DEFAULT_AIRDROPPED_KARMA,
            downvote: 0,
            epoch: Number(epoch) + 1,
            action: 'UST',
            data: '0',
          });
        await newRecord.save((err) => console.log('save airdrop record error: ' + err));

        return {transaction: tx.hash}
    }
  }

  export = new AirdropController();