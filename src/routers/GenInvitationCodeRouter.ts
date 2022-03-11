import { NextFunction, Request, Response, Router } from 'express';
import GenInvitationCodeController from '../controllers/GenInvitationCodeController';
import InvitationCode, { IInvitationCode } from '../database/models/invitationCode';

const router = Router()
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    if (req.query.code !== undefined && req.query.code.toString() === global.adminSessionCode) {
        try {
            const ret = await GenInvitationCodeController.genCode();
            res.status(200).json(ret);
        }
        catch (error) {
            console.log(error);
            next(error);
        }
    } else {
        res.status(403).json({ error: 'No available authentications' });
    }
})

router.get('/:ic', async (req: Request, res: Response, next: NextFunction) => {
    if (req.params.ic === global.adminSessionCode) {
        res.status(204).end()
        return
    }
    InvitationCode.findOneAndDelete({ code: req.params.ic }, (err, code) => {
        if (err !== null) {
            console.log('get invitation code error: ' + err);
            res.status(403).json({ error: err });
        } else if (code === null) {
            console.log('code is null');
            res.status(403).json({ error: 'Not available invitation code' });
        } else {
            res.status(200).json();
        }
    });
})

export default router
