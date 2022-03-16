import { NextFunction, Request, Response, Router } from 'express';
import BlockNumber from '../database/models/blockNumber';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    BlockNumber.findOne({}, (err, blockNumber) => {
        res.status(200).json(blockNumber.number)
    })
})

export default router
