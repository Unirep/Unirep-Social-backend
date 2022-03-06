import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IAccountTransaction extends Document {
    signedData: string
    address: string
    nonce: number
}

export const AccountTransactionSchema = new Schema({
  signedData: { type: String, required: true, },
  address: { type: String, required: true, },
  nonce: { type: Number, required: true, }
})

export default mongoose.model<IAccountTransaction>('AccountTransaction', AccountTransactionSchema)
