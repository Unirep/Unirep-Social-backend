import { NextFunction, Request, Response, Router } from 'express'
import SynchronizerState from '../database/models/synchronizerState'
import catchError from './catchError'

const router = Router()

router.get(
    '/',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        const state = await SynchronizerState.findOne({})
        res.json({
            blockNumber: state?.latestCompleteBlock ?? 0,
        })
    })
)

export default router
