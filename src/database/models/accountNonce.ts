import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IAccountNonce extends Document {
    address: string
    nonce: number
}

export const AccountNonceSchema = new Schema({
    address: { type: String, required: true, },
    nonce: { type: Number, required: true, }
})

export default mongoose.model<IAccountNonce>('AccountNonce', AccountNonceSchema)
