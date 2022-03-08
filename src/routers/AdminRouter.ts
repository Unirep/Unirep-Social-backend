import { NextFunction, Request, Response, Router } from 'express';

const router = Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  if (req.query.code !== undefined) {
      console.log(req.query.code);
      if (req.query.code.toString() === global.adminSessionCode) {
          res.status(200).json();
      } else {
          res.status(403).json('wrong code');
      }
  } else if (req.query.id !== undefined && req.query.password !== undefined) {
      if (req.query.id.toString() === process.env.ADMIN_ID && req.query.password.toString() === process.env.ADMIN_PASSWORD) {
          res.status(200).json(global.adminSessionCode);
      } else {
          res.status(403).json('wrong admin id or password');
      }
  } else {
      console.log('no such route');
      next('no such route');
  }
});

export default router
