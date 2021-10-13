import { NextFunction, Request, Response, Router } from 'express';
import USTController from '../controllers/USTController';

class USTRouter {
  private _router = Router();
  private _controller = USTController;

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
    this._router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ret = await this._controller.userStateTransition(req.body);
            res.status(200).json(ret);
        } catch (error) {
            console.log(error);
            next(error);
        }
      });
  }
}

export = new USTRouter().router;