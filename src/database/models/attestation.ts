import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IAttestation {
  transactionHash: string
  epoch: number
  attester: string
  proofIndex: number
  attesterId: number
  posRep: number
  negRep: number
  graffiti: string
  signUp: boolean
}

export interface IAttestations extends Document {
  epochKey: string
  attestations: Array<IAttestation>
}
  
const AttestationsSchema: Schema = new Schema({
  epochKey: { type: String },
  attestations: { type: Array },
}, { collection: 'Attestations' });


export default mongoose.model<IAttestations>('Attestations', AttestationsSchema);