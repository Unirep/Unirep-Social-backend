import { Request, Response, Router } from 'express'
import catchError from './catchError'
import { UNIREP, UNIREP_SOCIAL } from '../constants'

const router = Router()

router.get(
    '/',
    catchError(async (_: Request, res: Response) => {
        res.json({
            unirepAddress: UNIREP,
            unirepSocialAddress: UNIREP_SOCIAL,
        })
    })
)

export default router
