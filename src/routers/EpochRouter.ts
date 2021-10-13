import { NextFunction, Request, Response, Router } from 'express';
import EpochController from '../controllers/EpochController';

class EpochRouter {
  private _router = Router();
  private _controller = EpochController;

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
        try {
            res.status(200).json(global.nextEpochTransition);
        } catch (error) {
            console.log(error);
            next(error);
        }
      });
    
    this._router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        if (req.headers.authorization === 'NLmKDUnJUpc6VzuPc7Wm') {
            try {
                await this._controller.epochTransition();
                res.status(200).json('epoch transition done.');
            } catch (error) {
                console.log(error);
                next(error);
            }
            
        } else {
            res.status(403).json({error: 'No available authentications'});
        }
      });
  }
}

export = new EpochRouter().router;