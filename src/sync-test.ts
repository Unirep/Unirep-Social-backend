import { config } from 'dotenv'
config()
import { Synchronizer } from './daemons/NewSynchronizer'
import { SQLiteMemoryConnector } from 'anondb/node'
import schema from './schema'
;(async () => {
    const db = await SQLiteMemoryConnector.create(schema)
    const s = new Synchronizer(db)
    await s.start()
})()
