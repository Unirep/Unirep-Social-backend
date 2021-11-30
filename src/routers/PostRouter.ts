import { NextFunction, Request, Response, Router } from 'express';
import PostController from '../controllers/PostController';
import { QueryType } from '../constants';

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
        if (req.query.maintype === undefined) {
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
            let sort: string, maintype: string, subtype: string, start: number, end: number, lastRead: string;
            maintype = req.query.maintype.toString();
            if (req.query.sort === undefined) {
              if (req.query.maintype === QueryType.popularity) {
                sort = QueryType.most;
              } else {
                sort = QueryType.newest;
              }
            } else {
              sort = req.query.sort.toString();
            }
            if (req.query.subtype === undefined) {
              if (req.query.maintype === QueryType.popularity) {
                subtype = QueryType.votes;
              } else {
                subtype = QueryType.posts;
              }
            } else {
              subtype = req.query.subtype.toString();
            }
            if (req.query.start === undefined) {
              start = 0;
            } else {
              start = parseInt(req.query.start.toString());
            }
            if (req.query.end === undefined) {
              end = Date.now();
            } else {
              end = parseInt(req.query.end.toString());
            }
            if (req.query.lastRead === undefined) {
              lastRead = '0';
            } else {
              lastRead = req.query.lastRead.toString();
            }
            
            const result = await this._controller.getPostWithQuery(sort, maintype, subtype, start, end, lastRead);
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