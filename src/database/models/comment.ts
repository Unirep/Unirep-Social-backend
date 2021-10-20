import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';
import { IVote } from './vote';

export interface IComment extends Document {
    postId: string,
    transactionHash: string
    content: string
    hashedContent: string
    epoch: number
    epochKey: string
    epkProof: [ string ]
    proofIndex: number
    proveMinRep: boolean
    minRep: number
    posRep: number
    negRep: number
    votes: [ IVote ]
    status: number // 0: pending, 1: on-chain, 2: disabled
  }
  
  const CommentSchema: Schema = new Schema({
    postId: { type: String, required: true },
    transactionHash: { type: String },
    content: { type: String },
    hashedContent: {type: String},
    epoch: { type: Number, required: true },
    epochKey: { type: String, required: true },
    epkProof: { type: [], required: true },
    proofIndex: { type: Number, required: true },
    proveMinRep: { type: Boolean },
    minRep: { type: Number },
    posRep: { type: Number, required: true },
    negRep: { type: Number, required: true },
    votes: { type: [ ] },
    status: { type: Number, required: true },
  }, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  });
  
  export default mongoose.model<IComment>('Comment', CommentSchema);