import { NextFunction, Request, Response, Router } from 'express';
import Report, { IReport } from '../database/models/report';

class ReportRouter {
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
        console.log(req.query.issue);
        console.log(req.query.email);
        const report: IReport = new Report({
            issue: req.query.issue,
            email: req.query.email,
        });

        report.save().then(() => {
            res.status(200).json();
        })
      });
  }
}

export = new ReportRouter().router;