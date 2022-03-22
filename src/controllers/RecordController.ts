import Record from '../database/models/record'
import Post from '../database/models/post'
import Comment from '../database/models/comment'
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
        const tmp = record.data.split('_')
        if (tmp.length === 1) {
            const p = await Post.findOne({ transactionHash: tmp[0] })
            if (p === null) continue
            ret.push({
                ...record.toObject(),
                content: `${
                    p.title !== undefined && p.title.length > 0
                        ? titlePrefix + p.title + titlePostfix
                        : ''
                }${p.content}`,
            })
        } else {
            const c = await Comment.findOne({
                transactionHash: tmp[1],
            })
            if (c === null) continue
            ret.push({
              ...record.toObject(),
              content: c.content,
            })
        }
    }
    return ret
}

export default {
    getRecords,
}
