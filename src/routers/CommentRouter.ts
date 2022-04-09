import { NextFunction, Request, Response, Router } from 'express'
import CommentController from '../controllers/CommentController'
import catchError from './catchError'
import Comment from '../models/comment'

const router = Router()

router.get(
    `/:id`,
    catchError(async (req, res) => {
        const comment = await Comment.findOne({
            transactionHash: req.params.id,
        }).lean()
        res.json(comment)
    })
)

router.get(
    '/',
    catchError(async (req, res, next) => {
        if (req.query.query === undefined) {
            const result = await CommentController.listAllComments()
            res.json(result)
        } else {
            let query: string,
                lastRead: string,
                epks: string[] = []
            query = req.query.query.toString()
            if (req.query.lastRead === undefined) {
                lastRead = '0'
            } else {
                lastRead = req.query.lastRead.toString()
            }
            if (
                req.query.epks !== undefined &&
                req.query.epks.toString() !== ''
            ) {
                epks = req.query.epks.toString().split('_')
            }

            const result = await CommentController.getCommentsWithQuery(
                query,
                lastRead,
                epks
            )
            res.json(result)
        }
    })
)

router.post('/', catchError(CommentController.leaveComment))

export default router
