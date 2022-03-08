import { NextFunction, Request, Response, Router } from 'express';
import EpochController from '../controllers/EpochController';
import EpochManager from '../daemons/EpochManager'
import catchError from './catchError'

const router = Router()

router.get('/', catchError(async (req: Request, res: Response, next: NextFunction) => {
  const nextTransition = await EpochManager.nextTransition()
  res.json({ nextTransition });
}))

router.post('/', catchError(EpochController.epochTransition))

export default router
