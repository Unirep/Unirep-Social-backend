import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IGSTLeaf {
    transactionHash: string
    hashedLeaf: string
}

export interface IGSTLeaf extends Document {
    epoch: number
    transactionHash: string
    hash: string
    index: number
}

const GSTLeafSchema: Schema = new Schema({
    epoch: { type: Number, },
    transactionHash: { type: String },
    hash: { type: String },
    index: { type: Number, },
}, { collection: 'GSTLeaf' })

export default mongoose.model<IGSTLeaf>('GSTLeaf', GSTLeafSchema);
