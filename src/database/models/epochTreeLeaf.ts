import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

export interface IEpochTreeLeaf extends Document {
    epoch: number
    epochKey: string
    hashchain: string
    index: number
}

const EpochGSTLeafSchema: Schema = new Schema(
    {
        epoch: { type: Number, unique: true },
        epochKey: { type: String },
        hashchain: { type: String },
        hash: { type: String, required: true },
    },
    { collection: 'EpochTreeLeaf' }
)

export default mongoose.model<IEpochTreeLeaf>(
    'EpochTreeLeaf',
    EpochGSTLeafSchema
)
