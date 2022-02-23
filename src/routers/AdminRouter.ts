import { NextFunction, Request, Response, Router } from 'express';

class AdminRouter {
  private _router = Router();

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
        if (req.query.code !== undefined) {
            console.log(req.query.code);
            if (req.query.code.toString() === 'NLmKDUnJUpc6VzuPc7Wm') {
                res.status(200).json();
            } else {
                res.status(403).json('wrong code');
            }
        } else if (req.query.id !== undefined && req.query.password !== undefined) {
            if (req.query.id.toString() === process.env.ADMIN_ID && req.query.password.toString() === process.env.ADMIN_PASSWORD) {
                res.status(200).json('NLmKDUnJUpc6VzuPc7Wm');
            } else {
                res.status(403).json('wrong admin id or password');
            }
        } else {
            console.log('no such route');
            next('no such route');
        }
      });
  }
}

export = new AdminRouter().router;