import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';
  
export interface IGSTRoots extends Document {
  epoch: number
  GSTRoots: Array<string>
}

const GSTRootsSchema: Schema = new Schema({
    epoch: { type: Number },
    GSTRoots: { type: Array },
}, { collection: 'GSTRoots' })

export default mongoose.model<IGSTRoots>('GSTRoots', GSTRootsSchema);