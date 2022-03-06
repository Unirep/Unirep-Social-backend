import { NextFunction, Request, Response, Router } from 'express';
import AirdropController from '../controllers/AirdropController';

const router = Router()

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AirdropController.getAirdrop(req.body);
    res.status(200).json(result);
  }
  catch (error) {
    console.log(error);
    next(error);
  }
})

export default router
