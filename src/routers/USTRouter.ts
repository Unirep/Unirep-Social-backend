import { NextFunction, Request, Response, Router } from 'express';
import USTController from '../controllers/USTController';

const router = Router()

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
      const ret = await USTController.userStateTransition(req.body);
      res.status(200).json(ret);
  } catch (error) {
      console.log(error);
      next(error);
  }
});

export default router
