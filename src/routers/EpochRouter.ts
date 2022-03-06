import { NextFunction, Request, Response, Router } from 'express';
import EpochController from '../controllers/EpochController';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
      res.status(200).json(global.nextEpochTransition);
  } catch (error) {
      console.log(error);
      next(error);
  }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization === 'NLmKDUnJUpc6VzuPc7Wm') {
      try {
          await EpochController.epochTransition();
          res.status(200).json('epoch transition done.');
      } catch (error) {
          console.log(error);
          next(error);
      }

  } else {
      res.status(403).json({error: 'No available authentications'});
  }
})

export default router
