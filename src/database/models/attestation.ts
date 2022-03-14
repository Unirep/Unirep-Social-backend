import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IAttestation extends Document {
    epoch: number
    epochKey: string
    epochKeyToHashchainMap: string
    // attestation info
    index: number
    transactionHash: string
    attester: string
    proofIndex: number
    attesterId: number
    posRep: number
    negRep: number
    graffiti: string
    signUp: boolean
    hash: string
    valid: boolean
}

const AttestationSchema: Schema = new Schema({
    epoch: { type: Number },
    epochKey: { type: String },
    epochKeyToHashchainMap: { type: String },
    index: { type: Number },
    transactionHash: { type: String },
    attester: { type: String },
    proofIndex: { type: Number },
    attesterId: { type: Number },
    posRep: { type: Number },
    negRep: { type: Number },
    graffiti: { type: String },
    signUp: { type: Boolean },
    hash: { type: String, required: true, },
    valid: { type: Boolean },
}, { collection: 'Attestation' });

export default mongoose.model<IAttestation>('Attestation', AttestationSchema);
