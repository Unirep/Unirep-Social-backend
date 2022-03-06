import { NextFunction, Request, Response, Router } from 'express';
import SignInController from '../controllers/SignInController';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await SignInController.signIn(req.query.commitment!.toString());
    res.status(200).json(result);
  }
  catch (error) {
    console.log(error);
    next(error);
  }
})

export default router
