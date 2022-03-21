import * as mongoose from 'mongoose'
import { Schema } from 'mongoose'

export interface IEpoch {
    currentEpoch: number
    blockNumber: number
    processed: boolean
}

const EpochSchema: Schema = new Schema(
    {
        number: {
            type: Number,
            unique: true,
        },
        sealed: {
            type: Boolean,
            default: false,
        },
        epochRoot: {
            type: String,
        },
    },
    { collection: 'Epoch' }
)

export default mongoose.model<IEpoch>('Epoch', EpochSchema)
