import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

export interface INullifier extends Document {
    epoch: number
    nullifier: string
    transactionHash: string
    confirmed: boolean
}

const NullifierSchema: Schema = new Schema(
    {
        epoch: { type: Number },
        nullifier: { type: String, unique: true },
        transactionHash: { type: String },
        confirmed: { type: Boolean, default: true },
    },
    { collection: 'Nullifiers' }
)

export default mongoose.model<INullifier>('Nullifier', NullifierSchema)
