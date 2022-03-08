import { NextFunction, Request, Response, Router } from 'express';
import Report, { IReport } from '../database/models/report';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  console.log(req.query.issue);
  console.log(req.query.email);
  const report: IReport = new Report({
      issue: req.query.issue,
      email: req.query.email,
  });

  report.save().then(() => {
      res.status(200).json();
  })
})

export default router
