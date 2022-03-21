import { NextFunction, Request, Response, Router } from 'express'
import BlockNumber from '../database/models/blockNumber'

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blockNumber = await BlockNumber.findOne({})
        res.status(200).json(blockNumber?.number)
    } catch (error) {
        console.log(error)
        next(error)
    }
})

export default router
