import { NextFunction, Request, Response, Router } from 'express';
import SignUpController from '../controllers/SignUpController';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await SignUpController.signUp(req.query.commitment!.toString(), req.query.epk!.toString());
    res.status(200).json(result);
  }
  catch (error) {
    console.log(error);
    next(error);
  }
})

// router.post('/', async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     console.log('sign up unirep user')
//     const result = await SignUpController.signUpUnirepUser(req.body);
//     res.status(200).json(result);
//   }
//   catch (error) {
//     console.log(error);
//     next(error);
//   }
// });
export default router
