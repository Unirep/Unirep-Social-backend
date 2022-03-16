import { Router } from 'express';
import SignUpRouter from './SignUpRouter';
import SignInRouter from './SignInRouter';
import AirdropRouter from './AirdropRouter';
import PostRouter from './PostRouter';
import CommentRouter from './CommentRouter';
import VoteRouter from './VoteRouter';
import GenInvitationCodeRouter from './GenInvitationCodeRouter';
import EpochRouter from './EpochRouter';
import USTRouter from './USTRouter';
import RecordRouter from './RecordRouter';
import ReportRouter from './ReportRouter';
import AdminRouter from './AdminRouter';
import BlockRouter from './BlockRouter';

const router = Router()
router.use('/signup', SignUpRouter);
router.use('/signin', SignInRouter);
router.use('/airdrop', AirdropRouter);
router.use('/post', PostRouter);
router.use('/comment', CommentRouter);
router.use('/vote', VoteRouter);
router.use('/genInvitationCode', GenInvitationCodeRouter);
router.use('/epochTransition', EpochRouter);
router.use('/userStateTransition', USTRouter);
router.use('/records', RecordRouter);
router.use('/report', ReportRouter);
router.use('/admin', AdminRouter);
router.use('/block', BlockRouter);

export default router
