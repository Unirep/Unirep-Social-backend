import { NextFunction, Request, Response, Router } from 'express'
import EpkRecord from '../database/models/epkRecord'
import Record from '../database/models/record'
import userSignUp from '../database/models/userSignUp'
import RecordController from '../controllers/RecordController'
import { ActionType } from '../constants'

const router = Router()

router.get(
    '/:epks',
    async (req: Request, res: Response, next: NextFunction) => {
        // console.log(req.params.epks);
        const epks = req.params.epks.split('_')
        if (
            req.query.spentonly !== undefined &&
            req.query.spentonly.toString() === 'true'
        ) {
            const records = await Record.find({
                $or: [
                    {
                        from: {
                            $in: epks,
                        },
                    },
                    {
                        to: {
                            $in: epks,
                        },
                        action: ActionType.Vote,
                    },
                ],
            }).lean()
            const recordsByFrom = records.reduce((acc, val) => {
                return {
                    [val.from]: [...(acc[val.from] || []), val],
                    ...acc,
                }
            }, {})
            const epkRecords = await EpkRecord.find({
                epk: { $in: epks },
            }).lean()
            res.json(
                epkRecords.map((r) => ({
                    ...r,
                    records: recordsByFrom[r.epk] || [],
                }))
            )
        } else {
            try {
                const ret = await RecordController.getRecords(epks)
                res.status(200).json(ret)
            } catch (error) {
                console.log(error)
                next(error)
            }
        }
    }
)

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    const commitment = req.query.commitment
    userSignUp.find({ commitment: commitment?.toString() }, (err, records) => {
        res.status(200).json(records)
    })
})

export default router
