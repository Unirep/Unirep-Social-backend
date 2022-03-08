import { NextFunction, Request, Response } from 'express';

export default (fn: any) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res, next)
  } catch (err: any) {
    console.log(err)
    res.status(500).json({
      message: 'Uncaught error',
      info: err.toString(),
    })
  }
}
