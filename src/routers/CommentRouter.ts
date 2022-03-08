import { NextFunction, Request, Response, Router } from 'express';
import CommentController from '../controllers/CommentController';
import catchError from './catchError'

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  if (req.query.query === undefined) {
    try {
      const result = await CommentController.listAllComments();
      res.status(200).json(result);
    }
    catch (error) {
      console.log(error);
      next(error);
    }
  } else {
    try {
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

      const result = await CommentController.getCommentsWithQuery(query, lastRead, epks);
      res.status(200).json(result);
    }
    catch (error) {
      console.log(error);
      next(error);
    }
  }
})

router.post('/', catchError(CommentController.leaveComment))

export default router
