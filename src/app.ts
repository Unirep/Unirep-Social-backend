import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
// load the environment variables from the .env file before constants file
dotenv.config()
import MasterRouter from './routers/MasterRouter'
import EpochManager from './daemons/EpochManager'
import TransactionManager from './daemons/TransactionManager'
import Synchronizer from './daemons/Synchronizer'

import { MONGO_URL, DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER } from './constants'
// import { startEventListeners } from './daemons/listener'

main().catch((err) => {
    console.log(`Uncaught error: ${err}`)
    process.exit(1)
})

async function main() {
    // try database connection
    mongoose.connect(MONGO_URL)
    // Bind connection to error event (to get notification of connection errors)
    mongoose.connection.on(
        'error',
        console.error.bind(console, 'MongoDB connection error:')
    )

    // now start listening for eth events
    // await startEventListeners()

    // start watching for epoch transitions
    await EpochManager.updateWatch()
    TransactionManager.configure(DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER)
    await TransactionManager.start()
    await Synchronizer.start()

    // now start the http server
    const app = express()
    app.use(cors())
    app.use(express.json())
    app.use('/api', MasterRouter)
    const port = process.env.APP_PORT ?? 5000
    app.listen(port, () => console.log(`> Listening on port ${port}`))
}
