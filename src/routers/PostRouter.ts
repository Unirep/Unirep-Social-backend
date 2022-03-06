import { NextFunction, Request, Response, Router } from 'express';
import PostController from '../controllers/PostController';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.query.query === undefined) {
            const result = await PostController.listAllPosts();
            res.status(200).json(result);
        } else {
          let query: string, lastRead: string, epks: string[] = [];
          query = req.query.query.toString();
          if (req.query.lastRead === undefined) {
            lastRead = '0';
          } else {
            lastRead = req.query.lastRead.toString();
          }
          if (req.query.epks !== undefined && req.query.epks.toString() !== '') {
            epks = req.query.epks.toString().split('_');
          }

          const result = await PostController.getPostWithQuery(query, lastRead, epks);
          res.status(200).json(result);
        }
      } catch (error) {
        console.log(error);
        next(error);
      }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await PostController.getPostWithId(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    console.log(error);
    next(error);
  }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await PostController.publishPost(req.body);
        res.status(200).json(result);
    }
    catch (error) {
        console.log(error);
        next(error);
    }
})

export default router
