import { NextFunction, Request, Response, Router } from 'express';
import VoteController from '../controllers/VoteController';

const router = Router()

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await VoteController.vote(req.body);
        res.status(200).json(result);
    } catch (error) {
        console.log(error);
        next(error);
    }
})

export default router
