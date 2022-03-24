import Record from '../models/record'
import Post from '../models/post'
import Comment from '../models/comment'
import { titlePrefix, titlePostfix } from '../constants'

const getRecords = async (epks: string[]) => {
    const records = await Record.find({
        $or: [{ to: { $in: epks } }, { from: { $in: epks } }],
    })
    const ret: any[] = []
    for (const record of records) {
        if (record.data === '0') {
            ret.push(record)
            continue
        }
        
        if (record.action === 'Post') {
            const p = await Post.findOne({ transactionHash: record.data })
            if (p === null) continue
            ret.push({
                ...record.toObject(),
                content: `${
                    p.title !== undefined && p.title.length > 0
                        ? titlePrefix + p.title + titlePostfix
                        : ''
                }${p.content}`,
            })
        } else if (record.action === 'Comment') {
            const c = await Comment.findOne({
                transactionHash: record.data,
            })
            if (c === null) continue
            ret.push({
                ...record.toObject(),
                content: c.content,
            })
        } else {
            continue
        }
    }
    return ret
}

export default {
    getRecords,
}
