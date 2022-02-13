import * as mongoose from 'mongoose';
import { Schema } from 'mongoose';

export interface IEpoch {
    currentEpoch: number
}
  
const EpochSchema: Schema = new Schema({
    currentEpoch: { type: Number, unique: true },
}, { collection: 'Epoch' })

export default mongoose.model<IEpoch>('Epoch', EpochSchema);