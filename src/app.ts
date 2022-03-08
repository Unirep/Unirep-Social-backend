import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import EpochManager from './EpochManager'
import TransactionManager from './TransactionManager'

import MasterRouter from './routers/MasterRouter';
import dotenv from 'dotenv';

// load the environment variables from the .env file
dotenv.config();

import { DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER, } from './constants';
import { startEventListeners } from './listener'

main()
  .catch(err => {
    console.log(`Uncaught error: ${err}`)
    process.exit(1)
  })

async function main() {
    // try database connection
    const mongoDB = 'mongodb://127.0.0.1:27017/unirep_social';
    mongoose.connect(mongoDB);
    // Bind connection to error event (to get notification of connection errors)
    mongoose.connection
      .on('error', console.error.bind(console, 'MongoDB connection error:'));

    // now start listening for eth events
    await startEventListeners()

    // start watching for epoch transitions
    await EpochManager.updateWatch()

    TransactionManager.configure(DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER)
    await TransactionManager.start()

    // now start the http server
    const app = express()
    app.use(cors());
    app.use(express.json());
    app.use('/api', MasterRouter);
    // make server app handle any error
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        // TODO: refactor this middleware out, handle errors at the route level
        res.status(err.statusCode || 500).json({
            status: 'error',
            statusCode: err.statusCode,
            message: err.message
        });
    });
    const port = process.env.APP_PORT ?? 5000
    app.listen(port, () => console.log(`> Listening on port ${port}`));
}
