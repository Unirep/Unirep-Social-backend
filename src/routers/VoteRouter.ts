import { Router } from 'express'
import VoteController from '../controllers/VoteController'
import catchError from './catchError'

const router = Router()

router.post('/', catchError(VoteController.vote))

export default router
