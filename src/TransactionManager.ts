import mongoose from 'mongoose'
import AccountNonce from './database/models/accountNonce'
import AccountTransaction from './database/models/accountTransaction'
import { ethers } from 'ethers'
import {
  DEPLOYER_PRIV_KEY,
  DEFAULT_ETH_PROVIDER,
} from './constants';

class TransactionManager {

    async start() {
        const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER)
        const latestNonce = await wallet.getTransactionCount()
        await AccountNonce.updateMany({
          address: wallet.address,
        }, {
          address: wallet.address,
          nonce: latestNonce,
        }, {
          upsert: true,
        })
        this.startDaemon()
    }

    async startDaemon() {
        for (;;) {
            const nextTx = await AccountTransaction.findOne({}).sort({
              nonce: 1,
            })
            if (!nextTx) {
              await new Promise(r => setTimeout(r, 5000))
              continue
            }
            const sent = await this.tryBroadcastTransaction(nextTx.signedData)
            if (sent) {
              await AccountTransaction.deleteOne({
                signedData: nextTx.signedData,
              })
            } else {
              await new Promise(r => setTimeout(r, 2000))
            }
        }
    }

    async tryBroadcastTransaction(signedData) {
      try {
        console.log(`Sending tx ${ethers.utils.keccak256(signedData)}`)
        await DEFAULT_ETH_PROVIDER.sendTransaction(signedData)
        return true
      } catch (err: any) {
        if (err.toString().indexOf('VM Exception while processing transaction') !== -1) {
          // if the transaction is reverted the nonce is still used, so we return true
          return true
        } else {
          return false
        }
      }
    }

    async getNonce(address: string) {
        const doc = await AccountNonce.findOneAndUpdate({
          address,
        }, {
          $inc: {
            nonce: 1,
          }
        })
        if (!doc) throw new Error('No initial nonce')
        return doc.nonce
    }

    async queueTransaction(to: string, data: string) {
      const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER)
      const gasLimit = await wallet.provider.estimateGas({
        to,
        data,
      })
      const nonce = await this.getNonce(wallet.address)
      const signedData = await wallet.signTransaction({
        gasLimit,
        to,
        data,
        nonce,
      })
      await AccountTransaction.create({
        address: wallet.address,
        signedData,
        nonce,
      })
      return ethers.utils.keccak256(signedData)
    }
}

export default new TransactionManager()
