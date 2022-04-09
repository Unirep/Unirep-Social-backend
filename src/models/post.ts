import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

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
    posRep: number
    negRep: number
    totalRep: number
    status: number // 0: pending, 1: on-chain, 2: disabled
    commentCount: number
}

const PostSchema: Schema = new Schema(
    {
        transactionHash: { type: String },
        title: { type: String },
        content: { type: String },
        hashedContent: { type: String },
        epoch: { type: Number, required: true },
        epochKey: { type: String, required: true },
        // epkProof:  { type: [], required: true},
        proofIndex: { type: Number },
        proveMinRep: { type: Boolean },
        minRep: { type: Number },
        posRep: { type: Number, default: 0 },
        negRep: { type: Number, default: 0 },
        totalRep: { type: Number, default: 0 },
        status: { type: Number, required: true },
        commentCount: { type: Number, default: 0 },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
)

export default mongoose.model<IPost>('Post', PostSchema)
