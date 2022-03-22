import { NextFunction, Request, Response, Router } from 'express'
import SignInController from '../controllers/SignInController'
import catchError from './catchError'

const router = Router()

router.get(
    '/',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        const result = await SignInController.signIn(
            req.query.commitment!.toString()
        )
        res.json(result)
    })
)

export default router
