import { NextFunction, Request, Response, Router } from 'express';
import Record from '../database/models/record';

class RecordRouter {
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
      this._router.get('/:epks', async (req: Request, res: Response, next: NextFunction) => {
        console.log(req.params.epks);
        const epks = req.params.epks.split('_');
        Record.find({"to": {$in: epks}}, (err, record) => {
            console.log(record);
            console.log('find record error: ' + err);
            res.status(200).json(record);
        });
        
      });
  }
}

export = new RecordRouter().router;