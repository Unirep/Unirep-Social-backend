import base64url from 'base64url';

import ErrorHandler from '../ErrorHandler';
import { DEFAULT_ETH_PROVIDER, DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, identityCommitmentPrefix, add0x, DEFAULT_AIRDROPPED_KARMA } from '../constants';
import { UnirepSocialContract } from '@unirep/unirep-social';
import Record, { IRecord } from '../database/models/record';

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

      const newRecord: IRecord = new Record({
        to: epk,
        from: 'UnirepSocial',
        upvote: DEFAULT_AIRDROPPED_KARMA,
        downvote: 0,
        epoch,
        action: 'UST',
        data: '0',
      });
      await newRecord.save();

      return {transaction: tx.hash, epoch: epoch.toNumber()};
    }
  }

  export = new SignUpController();