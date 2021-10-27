import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IRecord extends Document {
    to: string
    from: string
    upvote: number
    downvote: number
    epoch: number
    action: string
  }
  
  const RecordSchema: Schema = new Schema({
    to: { type: String, required: true },
    from: { type: String, required: true },
    upvote: { type: Number, required: true },
    downvote: {type: Number, required: true},
    epoch: { type: Number, required: true },
    action: { type: String, required: true },
  }, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  });
  
  export default mongoose.model<IRecord>('Record', RecordSchema);