import ErrorHandler from '../ErrorHandler';
import randomstring from 'randomstring';
import InvitationCode, { IInvitationCode } from '../database/models/invitationCode';

class GenInvitationCodeController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    genCode = async () => {
        const randomOutput = randomstring.generate(8);
        console.log('random output: ' + randomOutput);

        const newCode: IInvitationCode = new InvitationCode({
          code: randomOutput
        });
        await newCode.save();

        return randomOutput;
    }
}

 export = new GenInvitationCodeController();