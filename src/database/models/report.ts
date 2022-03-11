import * as mongoose from 'mongoose';
import { Schema, Document } from 'mongoose';

export interface IReport extends Document {
    issue: string
    email: string
}

const ReportSchema: Schema = new Schema({
    issue: { type: String, required: true },
    email: { type: String }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model<IReport>('Report', ReportSchema);