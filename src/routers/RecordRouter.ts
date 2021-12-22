import { NextFunction, Request, Response, Router } from 'express';
import Record from '../database/models/record';
import EpkRecord from '../database/models/epkRecord';
import userSignUp from '../database/models/userSignUp';

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
        if (req.query.spentonly !== undefined && req.query.spentonly.toString() === 'true') {
            EpkRecord.find({epk: {$in: epks}}, (err, records) => {
                console.log(records);
                console.log('find epk record error: ' + err);
                res.status(200).json(records);
            });
        } else {
            Record.find({$or: [{"to": {$in: epks}}, {"from": {$in: epks}}]}, (err, records) => {
                console.log(records);
                console.log('find record error: ' + err);
                res.status(200).json(records);
            });
        }
      });
      
      this._router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        const commitment = req.query.commitment
        userSignUp.find({commitment: commitment?.toString()}, (err, records) => {
          res.status(200).json(records)
        })
      })
  }
}

export = new RecordRouter().router;