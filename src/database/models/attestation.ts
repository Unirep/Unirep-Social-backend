import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IAttestation {
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
}

export interface IAttestations extends Document {
    epoch: number
    epochKey: string
    epochKeyToHashchainMap: string
    attestations: Array<IAttestation>
}
  
const AttestationsSchema: Schema = new Schema({
    epoch: { type: Number },
    epochKey: { type: String },
    epochKeyToHashchainMap: { type: String },
    attestations: { type: Array },
}, { collection: 'Attestations' });


export default mongoose.model<IAttestations>('Attestations', AttestationsSchema);