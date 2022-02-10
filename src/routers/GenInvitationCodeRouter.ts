import { NextFunction, Request, Response, Router } from 'express';
import GenInvitationCodeController from '../controllers/GenInvitationCodeController';
import InvitationCode, { IInvitationCode } from '../database/models/invitationCode';

class GenInvitationCodeRouter {
  private _router = Router();
  private _controller = GenInvitationCodeController;

  get router() {
    return this._router;
  }

  constructor() {
    this._configure();
  }

  /**
   * Connect routes to their matching controller endpoints.
   */
  private _configure() {
    this._router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        if (req.query.code !== undefined && req.query.code.toString() === 'NLmKDUnJUpc6VzuPc7Wm') {
            try {
                const ret = await this._controller.genCode();
                res.status(200).json(ret);
              }
              catch (error) {
                console.log(error);
                next(error);
              }
        } else {
            res.status(403).json({error: 'No available authentications'});
        }
      });

      this._router.get('/:ic', async (req: Request, res: Response, next: NextFunction) => {
        InvitationCode.findOneAndDelete({code: req.params.ic}, (err, code) => {
          if (err !== null) {
            console.log('get invitation code error: ' + err);
            res.status(403).json({error: err});
          } else if (code === null) {
            console.log('code is null');
            res.status(403).json({error: 'Not available invitation code'});
          } else {
            res.status(200).json();
          }
        });
      });
  }
}

export = new GenInvitationCodeRouter().router;