import { ethers } from 'ethers'
import UnirepSocial from '@unirep/unirep-social/artifacts/contracts/UnirepSocial.sol/UnirepSocial.json'
import { deployUnirep } from '@unirep/contracts'
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import settings from './config'
import getPort from 'get-port';

// const GANACHE_URL = 'https://hardhat.unirep.social'
const GANACHE_URL = 'http://127.0.0.1:18545'
const FUNDED_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'

async function waitForGanache() {
    for (let x = 0; x < 100; x++) {
        await new Promise(r => setTimeout(r, 1000))
        try {
            const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
            await provider.getNetwork()
            break
        } catch (_) { }
    }
}

async function deploy(wallet: ethers.Wallet, overrides = {}) {
    const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
    const epochTreeDepth = 32
    const unirep = await deployUnirep(wallet, {
        globalStateTreeDepth: 5,
        userStateTreeDepth: 5,
        epochTreeDepth,
    },
        {
            ...settings,
            ...overrides,
        })
    const UnirepSocialF = new ethers.ContractFactory(UnirepSocial.abi, UnirepSocial.bytecode, wallet)
    const postReputation = 5
    const commentReputation = 3
    const airdrop = 30
    const unirepSocial = await UnirepSocialF.deploy(
        unirep.address,
        postReputation,
        commentReputation,
        airdrop
    )
    await unirepSocial.deployed()
    return { unirep, unirepSocial, epochTreeDepth, provider }
}

export async function startServer(contractOverrides = {}) {
    await waitForGanache()

    const sharedName = `unirep_test`

    const dbName = `${Math.floor(Math.random() * 100000000)}`
    const sharedDB = `mongodb://localhost:27017/${sharedName}`
    const mongoDB = `mongodb://127.0.0.1:27017/${dbName}`;
    mongoose.connect(mongoDB);
    // Bind connection to error event (to get notification of connection errors)
    mongoose.connection
        .on('error', console.error.bind(console, 'MongoDB connection error:'));

    const { TransactionManager } = require('../src/daemons/TransactionManager')

    const provider = new ethers.providers.JsonRpcProvider(GANACHE_URL)
    // this is the global manager shared across test processes
    const txManager = new TransactionManager()
    txManager.configure(FUNDED_PRIVATE_KEY, provider)
    await txManager.start(sharedDB)


    const wallet = ethers.Wallet.createRandom().connect(provider)

    // now fund our fresh wallet
    const hash = await txManager.queueTransaction(wallet.address, {
        value: ethers.BigNumber.from(10).pow(20) // 100 eth
    })
    await provider.waitForTransaction(hash)

    const data = await deploy(wallet, contractOverrides)
    const { unirep, unirepSocial } = data

    Object.assign(process.env, {
        UNIREP: unirep.address,
        UNIREP_SOCIAL: unirepSocial.address,
        DEPLOYER_PRIV_KEY: wallet.privateKey,
        DEFAULT_ETH_PROVIDER_URL: GANACHE_URL,
        ADMIN_SESSION_CODE: 'ffff',
        ...process.env,
    })

    const MasterRouter = require('../src/routers/MasterRouter').default
    const constants = require('../src/constants')
    const appTxManager = require('../src/daemons/TransactionManager').default
    const Synchronizer = require('../src/daemons/Synchronizer').default

    appTxManager.configure(wallet.privateKey, provider)
    await appTxManager.start()

    await Synchronizer.start()

    const app = express()
    app.use(cors());
    app.use(express.json());
    app.use('/api', MasterRouter);
    // make server app handle any error
    const port = await getPort()
    const url = `http://127.0.0.1:${port}`
    const attesterId = BigInt(await unirep.attesters(unirepSocial.address))
    await new Promise(r => app.listen(port, r as any))
    return { ...data, constants, url, attesterId }
}
