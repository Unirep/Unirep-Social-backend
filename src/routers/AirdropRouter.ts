import { Router } from 'express'
import AirdropController from '../controllers/AirdropController'
import catchError from './catchError'

const router = Router()

router.post('/', catchError(AirdropController.getAirdrop))

export default router
