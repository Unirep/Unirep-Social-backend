import { Router } from 'express'
import SignUpController from '../controllers/SignUpController'
import catchError from './catchError'

const router = Router()

router.get('/', catchError(SignUpController.signUp))

export default router
