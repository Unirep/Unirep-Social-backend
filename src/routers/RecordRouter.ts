import { NextFunction, Request, Response, Router } from 'express';
import EpkRecord from '../database/models/epkRecord';
import userSignUp from '../database/models/userSignUp';
import RecordController from '../controllers/RecordController';

const router = Router()

router.get('/:epks', async (req: Request, res: Response, next: NextFunction) => {
    // console.log(req.params.epks);
    const epks = req.params.epks.split('_');
    if (req.query.spentonly !== undefined && req.query.spentonly.toString() === 'true') {
        EpkRecord.find({ epk: { $in: epks } }, (err, records) => {
            // console.log(records);
            // console.log('find epk record error: ' + err);
            res.status(200).json(records);
        });
    } else {
        try {
            const ret = await RecordController.getRecords(epks);
            res.status(200).json(ret);
        } catch (error) {
            console.log(error);
            next(error);
        }

    }
})

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    const commitment = req.query.commitment
    userSignUp.find({ commitment: commitment?.toString() }, (err, records) => {
        res.status(200).json(records)
    })
})

export default router
