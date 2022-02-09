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

class MasterRouter {
  private _router = Router();
  private _signupRouter = SignUpRouter;
  private _signinRouter = SignInRouter;
  private _airdropRouter = AirdropRouter;
  private _postRouter = PostRouter;
  private _commentRouter = CommentRouter;
  private _voteRouter = VoteRouter;
  private _genInvitationCodeRouter = GenInvitationCodeRouter;
  private _epochRouter = EpochRouter;
  private _USTRouter = USTRouter;
  private _recordRouter = RecordRouter;
  private _reportRouter = ReportRouter;
  private _adminRouter = AdminRouter;

  get router() {
    return this._router;
  }

  constructor() {
    this._configure();
  }

  /**
   * Connect routes to their matching routers.
   */
  private _configure() {
    this._router.use('/signup', this._signupRouter);
    this._router.use('/signin', this._signinRouter);
    this._router.use('/airdrop', this._airdropRouter);
    this._router.use('/post', this._postRouter);
    this._router.use('/comment', this._commentRouter);
    this._router.use('/vote', this._voteRouter);
    this._router.use('/genInvitationCode', this._genInvitationCodeRouter);
    this._router.use('/epochTransition', this._epochRouter);
    this._router.use('/userStateTransition', this._USTRouter);
    this._router.use('/records', this._recordRouter);
    this._router.use('/report', this._reportRouter);
    this._router.use('/admin', this._adminRouter);
  }
}

export = new MasterRouter().router;