import * as mongoose from 'mongoose'
import { Schema, Document } from 'mongoose'
import { IRecord } from './record'

export interface IEpkRecord extends Document {
    epk: string
    records: [IRecord]
    posRep: number
    negRep: number
    spent: number
    epoch: number
}

const EpkRecordSchema: Schema = new Schema(
    {
        epk: { type: String, required: true },
        records: { type: [], required: true },
        posRep: { type: Number, required: true },
        negRep: { type: Number, required: true },
        spent: { type: Number, required: true },
        epoch: { type: Number, required: true },
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    }
)

export default mongoose.model<IEpkRecord>('EpkRecord', EpkRecordSchema)
