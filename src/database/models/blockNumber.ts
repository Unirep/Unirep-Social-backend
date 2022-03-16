import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IBlockNumber extends Document {
    number: number
}

export const BlockNumberSchema = new Schema({
    number: { type: Number, required: true, },
})

export default mongoose.model<IBlockNumber>('BlockNumber', BlockNumberSchema)
