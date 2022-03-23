import { NextFunction, Request, Response, Router } from 'express'
import GenInvitationCodeController from '../controllers/GenInvitationCodeController'
import InvitationCode, { IInvitationCode } from '../models/invitationCode'
import { ADMIN_SESSION_CODE } from '../constants'
import catchError from './catchError'

const router = Router()
router.get(
    '/',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        if (
            req.query.code !== undefined &&
            req.query.code.toString() === ADMIN_SESSION_CODE
        ) {
            const ret = await GenInvitationCodeController.genCode()
            res.json(ret)
        } else {
            res.status(403).json({ error: 'No available authentications' })
        }
    })
)

router.get(
    '/:ic',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        if (req.params.ic === ADMIN_SESSION_CODE) {
            res.status(204).end()
            return
        }
        const code = InvitationCode.findOneAndDelete({ code: req.params.ic })
        if (code === null) {
            console.log('code is null')
            res.status(403).json({ error: 'Not available invitation code' })
        } else {
            res.json({})
        }
    })
)

export default router
