import { config } from 'dotenv'
config()
import { UnirepSocialSynchronizer } from './daemons/NewSynchronizer'
import { SQLiteMemoryConnector } from 'anondb/node'
import schema from './schema'
;(async () => {
    const db = await SQLiteMemoryConnector.create(schema)
    const s = new UnirepSocialSynchronizer(db)
    await s.start()
})()
