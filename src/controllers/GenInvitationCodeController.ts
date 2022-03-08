import randomstring from 'randomstring';
import InvitationCode, { IInvitationCode } from '../database/models/invitationCode';

const genCode = async () => {
    const randomOutput = randomstring.generate(8);
    console.log('random output: ' + randomOutput);

    const newCode: IInvitationCode = new InvitationCode({
      code: randomOutput
    });
    await newCode.save();

    return randomOutput;
}

export default {
  genCode,
}
