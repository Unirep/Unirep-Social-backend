import { NextFunction, Request, Response, Router } from 'express'
import SynchronizerState from '../database/models/synchronizerState'

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const state = await SynchronizerState.findOne({})
        res.json({
            blockNumber: state?.latestCompleteBlock ?? 0,
        })
    } catch (error) {
        console.log(error)
        next(error)
    }
})

export default router
