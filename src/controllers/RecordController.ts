import ErrorHandler from '../ErrorHandler';
import Record, { IRecord } from '../database/models/record';
import Post, { IPost } from '../database/models/post';
import Comment, { IComment } from '../database/models/comment';

class RecordController {
    defaultMethod() {
      throw new ErrorHandler(501, 'API: Not implemented method');
    }

    getRecords = async (epks: string[]) => {
        console.log(epks);
        const records = await Record.find({$or: [{"to": {$in: epks}}, {"from": {$in: epks}}]}).then(
            async (records) => {
                let ret: any[] = [];
                for (var i = 0; i < records.length; i ++) {
                    if (records[i].data === '0') ret = [...ret, records[i]];
                    else {
                        let tmp = records[i].data.split('_');
                        if (tmp.length === 1) {
                            const p = await Post.findOne({'transactionHash': tmp[0]});
                            if (p !== null) {
                                ret = [...ret, {...records[i].toObject(), content: `${p.title.length > 0? '<title>' + p.title + '<title>' : ''}${p.content}`}];
                            }
                        } else {
                            const c = await Comment.findOne({'transactionHash': tmp[1]});
                            if (c !== null) {
                                ret = [...ret, {...records[i].toObject(), content: c.content}];
                            }
                        }
                    }
                }
                console.log(ret);
                return ret;
            }
        );

        return records;
    }
}

 export = new RecordController();