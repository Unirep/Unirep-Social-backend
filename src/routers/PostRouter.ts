import { NextFunction, Request, Response, Router } from 'express';
import PostController from '../controllers/PostController';

class PostRouter {
  private _router = Router();
  private _controller = PostController;

  get router() {
    return this._router;
  }

  constructor() {
    this._configure();
  }

  /**
   * Connect routes to their matching controller endpoints.
   */
  private _configure() {
    this._router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        if (req.query.qtype === undefined) {
          try {
            const result = await this._controller.listAllPosts();
            res.status(200).json(result);
          }
          catch (error) {
            console.log(error);
            next(error);
          }
        } else {
          try {
            const result = await this._controller.getPostWithQuery(req.query.qtype.toString(), req.query.subtype!.toString(), parseInt(req.query.start!.toString()), parseInt(req.query.end!.toString()), req.query.lastread!.toString());
            res.status(200).json(result);
          }
          catch (error) {
            console.log(error);
            next(error);
          }
        }
        
    });
    this._router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await this._controller.getPostWithId(req.params.id);
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        next(error);
      }
    });
    this._router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await this._controller.publishPost(req.body);
            res.status(200).json(result);
        }
        catch (error) {
            console.log(error);
            next(error);
        }
    });
  }
}

export = new PostRouter().router;