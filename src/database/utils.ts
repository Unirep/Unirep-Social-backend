import { ActionType } from '../constants'
import Record, { IRecord } from './models/record';
import EpkRecord from './models/epkRecord';

const writeRecord = async (to: string, from: string, posRep: number, negRep: number, epoch: number, action: string, txHash: string, data: string) => {
    // If the record is saved before, then ignore the transaction hash
    const record = await Record.findOne({ transactionHash: txHash })
    if(record !== null) return

    const newRecord: IRecord = new Record({
        to,
        from,
        upvote: posRep,
        downvote: negRep,
        epoch,
        action,
        data,
        transactionHash: txHash,
    });

    if (action === ActionType.Vote) {
        await EpkRecord.findOneAndUpdate(
            {epk: from, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: posRep + negRep} },
            { "new": true, "upsert": true },
        );

        await EpkRecord.findOneAndUpdate(
            {epk: to, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep, negRep} },
            { "new": true, "upsert": true },
        );
    } else {
        await EpkRecord.findOneAndUpdate(
            {epk: from, epoch},
            { "$push": { "records": newRecord._id.toString() }, "$inc": {posRep: 0, negRep: 0, spent: negRep} },
            { "new": true, "upsert": true },
          );
    }

    await newRecord.save();
}


export {
    writeRecord,
}
