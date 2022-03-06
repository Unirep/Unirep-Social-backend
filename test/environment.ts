import { ethers } from 'ethers'
import UnirepSocial from '@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json'
import Unirep from '@unirep/contracts/artifacts/contracts/Unirep.sol/Unirep.json'
import { deployUnirep } from '@unirep/contracts'
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import settings from './config'
import getPort from 'get-port';

const GANACHE_URL = 'http://localhost:18545'
const FUNDED_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'

async function waitForGanache() {
  for (let x = 0; x < 100; x++) {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
      await provider.getNetwork()
      break
    } catch (_) {}
  }
}

async function deploy(wallet: ethers.Wallet) {
  const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
  const epochTreeDepth = 32
  const unirep = await deployUnirep(wallet, {
      globalStateTreeDepth: 16,
      userStateTreeDepth: 4,
      epochTreeDepth,
    },
    settings
  )
  const UnirepSocialF = new ethers.ContractFactory(UnirepSocial.abi, UnirepSocial.bytecode, wallet)
  const unirepSocial = await UnirepSocialF.deploy(unirep.address, 3, 5, 30)
  await unirepSocial.deployed()
  return { unirep, unirepSocial, epochTreeDepth, provider }
}

export async function startServer() {
  await waitForGanache()

  const mongoDB = 'mongodb://127.0.0.1:27017/unirep_social_test';
  mongoose.connect(mongoDB);
  // Bind connection to error event (to get notification of connection errors)
  mongoose.connection
    .on('error', console.error.bind(console, 'MongoDB connection error:'));

  const { TransactionManager } = require('../src/TransactionManager')

  const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
  // this is the global manager shared across test processes
  const txManager = new TransactionManager()
  txManager.configure(FUNDED_PRIVATE_KEY, provider)
  await txManager.start()


  const wallet = ethers.Wallet.createRandom().connect(provider)

  // now fund our fresh wallet
  const hash = await txManager.queueTransaction(wallet.address, {
    value: ethers.BigNumber.from(10).pow(18)
  })
  await provider.waitForTransaction(hash)

  const data = await deploy(wallet)
  const { unirep, unirepSocial } = data

  Object.assign(process.env, {
    UNIREP: unirep.address,
    UNIREP_SOCIAL: unirepSocial.address,
    DEPLOYER_PRIV_KEY: wallet.privateKey,
    DEFAULT_ETH_PROVIDER_URL: GANACHE_URL,
    ...process.env,
  })

  const MasterRouter = require('../src/routers/MasterRouter').default
  const constants = require('../src/constants')
  const appTxManager = require('../src/TransactionManager').default
  const { startEventListeners } = require('../src/listener')

  appTxManager.configure(wallet.privateKey, provider)
  await appTxManager.start()

  global.adminSessionCode = 'ffff'

  await startEventListeners()

  const app = express()
  app.use(cors());
  app.use(express.json());
  app.use('/api', MasterRouter);
  // make server app handle any error
  const port = await getPort()
  const url = `http://127.0.0.1:${port}`
  await new Promise(r => app.listen(port, r as any))
  return { ...data, constants, url }
}
