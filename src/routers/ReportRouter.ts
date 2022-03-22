import { NextFunction, Request, Response, Router } from 'express'
import Report, { IReport } from '../database/models/report'
import catchError from './catchError'

const router = Router()

router.get(
    '/',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        const report: IReport = new Report({
            issue: req.query.issue,
            email: req.query.email,
        })
        await report.save()
        res.status(204).end()
    })
)

export default router
