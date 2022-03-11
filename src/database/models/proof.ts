import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IProof extends Document {
    index: number
    epoch: number
    toEpochKey: string
    proof: string
    publicSignals: string
    valid: boolean
    spent: boolean
    event: string
    transactionHash: string
}

const ProofSchema: Schema = new Schema({
    index: { type: Number, required: true },
    epoch: { type: Number, },
    toEpochKey: { type: Number, },
    proof: { type: String },
    publicSignals: { type: String },
    valid: { type: Boolean },
    spent: { type: Boolean },
    event: { type: String, required: true },
    transactionHash: { type: String, required: true },
    // only in StartTransitionProof
    blindedUserState: { type: String },
    blindedHashChain: { type: String },
    globalStateTree: { type: String },
    // only in ProcessAttestationsProof
    outputBlindedUserState: { type: String },
    outputBlindedHashChain: { type: String },
    inputBlindedUserState: { type: String },
    // only in UserStateTransitionProof
    proofIndexRecords: { type: Array },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: "Proof",
});

export default mongoose.model('Proof', ProofSchema);
