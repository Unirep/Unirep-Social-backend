import { ethers } from 'ethers'
import UnirepSocial from '@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json'
import Unirep from '@unirep/contracts/artifacts/contracts/Unirep.sol/Unirep.json'
import { deployUnirep } from '@unirep/contracts'
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import settings from './config'

const PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const PRIVATE_KEY_APP = '0x0000000000000000000000000000000000000000000000000000000000000002'
export async function deploy() {
  const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const epochTreeDepth = 32
  const unirep = await deployUnirep(wallet, {
      globalStateTreeDepth: 16,
      userStateTreeDepth: 4,
      epochTreeDepth,
    },
    settings
  )
  const UnirepSocialF = new ethers.ContractFactory(UnirepSocial.abi, UnirepSocial.bytecode, wallet)
  const unirepSocial = await UnirepSocialF.deploy(unirep.address, 1, 2, 50)
  await unirepSocial.deployed()
  return { unirep, unirepSocial, epochTreeDepth, provider }
}

export async function startServer() {
  const data = await deploy()
  const { unirep, unirepSocial } = data
  Object.assign(process.env, {
    UNIREP: unirep.address,
    UNIREP_SOCIAL: unirepSocial.address,
    DEPLOYER_PRIV_KEY: PRIVATE_KEY_APP,
    DEFAULT_ETH_PROVIDER_URL: 'http://localhost:8545',
    ...process.env,
  })

  const MasterRouter = require('../src/routers/MasterRouter').default
  const { identityCommitmentPrefix } = require('../src/constants')
  const TransactionManager = require('../src/TransactionManager').default

  const mongoDB = 'mongodb://127.0.0.1:27017/unirep_social';
  mongoose.connect(mongoDB);
  // Bind connection to error event (to get notification of connection errors)
  mongoose.connection
    .on('error', console.error.bind(console, 'MongoDB connection error:'));

  await TransactionManager.start()

  global.adminSessionCode = 'ffff'

  const app = express()
  app.use(cors());
  app.use(express.json());
  app.use('/api', MasterRouter);
  // make server app handle any error
  const port = process.env.APP_PORT ?? 5000
  app.listen(port, () => console.log(`> Listening on port ${port}`));
  return { ...data, identityCommitmentPrefix }
}
