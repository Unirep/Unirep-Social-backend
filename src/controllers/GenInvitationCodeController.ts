import ErrorHandler from '../ErrorHandler';
import randomstring from 'randomstring';

class GenInvitationCodeController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    genCode = () => {
        const randomOutput = randomstring.generate(8);
        console.log('random output: ' + randomOutput);

        return randomOutput;
    }
  }

  export = new GenInvitationCodeController();