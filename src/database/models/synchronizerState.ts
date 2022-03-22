import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

export interface ISynchronizerState extends Document {
  latestCompleteBlock: number
    latestProcessedBlock: number
    latestProcessedTransactionIndex: number
    latestProcessedEventIndex: number
}

export const SynchronizerStateSchema = new Schema({
  latestCompleteBlock: { type: Number, required: false },
    latestProcessedBlock: { type: Number, required: true },
    latestProcessedTransactionIndex: { type: Number, required: true },
    latestProcessedEventIndex: { type: Number, required: true },
})

export default mongoose.model<ISynchronizerState>('SynchronizerState', SynchronizerStateSchema)
