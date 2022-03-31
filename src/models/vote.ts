import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

export interface IVote {
    transactionHash: string
    epoch: number
    voter: string
    receiver: string
    posRep: number
    negRep: number
    graffiti: string
    overwriteGraffiti: boolean
    postId: string
    commentId: string
    status: number // 0: pending, 1: on-chain, 2: disabled
}

const VoteSchema: Schema = new Schema(
    {
        transactionHash: { type: String, required: true },
        epoch: { type: Number, required: true },
        voter: { type: String, required: true },
        receiver: { type: String, required: true },
        posRep: { type: Number, required: true },
        negRep: { type: Number, required: true },
        graffiti: { type: String },
        overwriteGraffiti: { type: Boolean },
        postId: { type: String },
        commentId: { type: String },
        status: { type: Number, required: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
)

export default mongoose.model<IVote>('Votes', VoteSchema)
