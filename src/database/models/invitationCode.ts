import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'

export interface IInvitationCode extends Document {
    code: string
}

const InvitationCodeSchema: Schema = new Schema(
    {
        code: { type: String, required: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
)

export default mongoose.model<IInvitationCode>(
    'InvitationCode',
    InvitationCodeSchema
)
