import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';


export interface IUserSignUp extends Document {
    transactionHash: string
    commitment: string
    epoch: number
}

const UserSignUpSchema: Schema = new Schema({
    transactionHash: { type: String },
    commitment: { type: String },
    epoch: { type: Number },
}, { collection: 'Users', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, })

export default mongoose.model<IUserSignUp>('UserSignUp', UserSignUpSchema);