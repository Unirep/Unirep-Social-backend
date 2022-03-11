import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IGSTRoot extends Document {
  epoch: number
  root: string
}

const GSTRootSchema: Schema = new Schema({
    epoch: { type: Number },
    root: { type: String },
}, { collection: 'GSTRoot' })

export default mongoose.model<IGSTRoot>('GSTRoot', GSTRootSchema);
