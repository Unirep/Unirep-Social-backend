import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IEpoch {
    currentEpoch: number
}
  
const EpochSchema: Schema = new Schema({
    currentEpoch: { type: Number },
}, { collection: 'Epoch' })

export default mongoose.model<IEpoch>('Epoch', EpochSchema);