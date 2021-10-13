import { NextFunction, Request, Response, Router } from 'express';
import VoteController from '../controllers/VoteController';

class VoteRouter {
  private _router = Router();
  private _controller = VoteController;

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
            const result = await this._controller.vote(req.body);
            res.status(200).json(result);
        } catch (error) {
            console.log(error);
            next(error);
        }
    });
  }
}

export = new VoteRouter().router;