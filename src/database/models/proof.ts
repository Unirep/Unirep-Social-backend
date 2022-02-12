import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IProof extends Document {
    index: number
    epoch: number
    args: string
    valid: boolean
    spent: boolean
    transactionHash: string
}
  
const ProofSchema: Schema = new Schema({
    index: { type: Number, required: true },
    epoch: { type: Number, required: true },
    args: {type: String },
    valid: { type: Boolean, required: true },
    spent: { type: Boolean },
    transactionHash: { type: String, required: true },
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
	collection: "Proof",
});
  
export default mongoose.model<IProof>('Proof', ProofSchema);