import { Router } from 'express';
import SignUpController from '../controllers/SignUpController';
import catchError from './catchError'

const router = Router()

router.get('/', catchError(SignUpController.signUp))

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
