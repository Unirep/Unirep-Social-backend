import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';
import { IVote } from './vote';

export interface IPost extends Document {
    transactionHash: string
    title: string
    content: string
    hashedContent: string
    epoch: number
    epochKey: string
    proofIndex: number
    proveMinRep: boolean
    minRep: number
    comments: [ string ]
    posRep: number
    negRep: number
    votes: [ IVote ]
    status: number // 0: pending, 1: on-chain, 2: disabled
  }
  
  const PostSchema: Schema = new Schema({
    transactionHash: { type: String },
    title: { type: String },
    content: { type: String },
    hashedContent: {type: String },
    epoch: { type: Number, required: true },
    epochKey: { type: String, required: true },
    // epkProof:  { type: [], required: true},
    proofIndex: { type: Number },
    proveMinRep: { type: Boolean },
    minRep: { type: Number },
    comments: { type: [ ]},
    posRep: { type: Number, required: true },
    negRep: { type: Number, required: true },
    votes: { type: [ ] },
    status: { type: Number, required: true },
  }, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  });
  
  export default mongoose.model<IPost>('Post', PostSchema);