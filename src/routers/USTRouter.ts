import { Router } from 'express';
import USTController from '../controllers/USTController';
import catchError from './catchError'

const router = Router()

router.post('/', catchError(USTController.userStateTransition))

export default router
