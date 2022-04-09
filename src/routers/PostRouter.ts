import { NextFunction, Request, Response, Router } from 'express'
import PostController from '../controllers/PostController'
import catchError from './catchError'

const router = Router()

router.get(
    '/',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        if (req.query.query === undefined) {
            const result = await PostController.listAllPosts()
            res.json(result)
            return
        }
        let query: string,
            lastRead: string,
            epks: string[] = []
        query = req.query.query.toString()
        if (req.query.lastRead === undefined) {
            lastRead = '0'
        } else {
            lastRead = req.query.lastRead.toString()
        }
        if (req.query.epks !== undefined && req.query.epks.toString() !== '') {
            epks = req.query.epks.toString().split('_')
        }

        const result = await PostController.getPostWithQuery(
            query,
            lastRead,
            epks
        )
        res.json(result)
    })
)

router.get(
    '/:id',
    catchError(async (req: Request, res: Response, next: NextFunction) => {
        const result = await PostController.getPostWithId(req.params.id)
        res.json(result)
    })
)

router.get('/:postId/comments', catchError(PostController.getCommentsByPostId))

router.post('/', catchError(PostController.publishPost))

export default router
