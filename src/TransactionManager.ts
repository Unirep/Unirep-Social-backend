import mongoose from 'mongoose'
import AccountNonce, { IAccountNonce, AccountNonceSchema } from './database/models/accountNonce'
import AccountTransaction, { IAccountTransaction, AccountTransactionSchema } from './database/models/accountTransaction'
import { ethers } from 'ethers'

export class TransactionManager {
    wallet?: ethers.Wallet
    AccountNonce: mongoose.Model<IAccountNonce> = AccountNonce
    AccountTransaction: mongoose.Model<IAccountTransaction> = AccountTransaction

    configure(key: string, provider: any) {
      this.wallet = new ethers.Wallet(key, provider)
    }

    async start(connection?: any) {
        if (!this.wallet) throw new Error('Not initialized')
        const latestNonce = await this.wallet.getTransactionCount()
        this.AccountNonce = (connection ? mongoose.createConnection(connection) : mongoose).model('AccountNonce', AccountNonceSchema)
        this.AccountTransaction = (connection ? mongoose.createConnection(connection) : mongoose).model('AccountTransaction', AccountTransactionSchema)
        await this.AccountNonce.findOneAndUpdate({
          address: this.wallet.address,
        }, {
          address: this.wallet.address,
          $setOnInsert: {
            nonce: latestNonce,
          }
        }, {
          upsert: true,
        })
        this.startDaemon()
    }

    async startDaemon() {
        for (;;) {
            const nextTx = await this.AccountTransaction.findOne({}).sort({
              nonce: 1,
            })
            if (!nextTx) {
              await new Promise(r => setTimeout(r, 5000))
              continue
            }
            const sent = await this.tryBroadcastTransaction(nextTx.signedData)
            if (sent) {
              await this.AccountTransaction.deleteOne({
                signedData: nextTx.signedData,
              })
            } else {
              await new Promise(r => setTimeout(r, 2000))
            }
        }
    }

    async tryBroadcastTransaction(signedData: string) {
      if (!this.wallet) throw new Error('Not initialized')
      try {
        console.log(`Sending tx ${ethers.utils.keccak256(signedData)}`)
        await this.wallet.provider.sendTransaction(signedData)
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
        const doc = await this.AccountNonce.findOneAndUpdate({
          address,
        }, {
          $inc: {
            nonce: 1,
          }
        })
        if (!doc) throw new Error('No initial nonce')
        return doc.nonce
    }

    async queueTransaction(to: string, data: string|any = {}) {
      const args = {} as any
      if (typeof data === 'string') {
        // assume it's input data
        args.data = data
      } else {
        Object.assign(args, data)
      }
      if (!this.wallet) throw new Error('Not initialized')
      const gasLimit = await this.wallet.provider.estimateGas({
        to,
        ...args,
      })
      const nonce = await this.getNonce(this.wallet.address)
      const signedData = await this.wallet.signTransaction({
        nonce,
        gasLimit,
        to,
        ...args,
      })
      await this.AccountTransaction.create({
        address: this.wallet.address,
        signedData,
        nonce,
      })
      return ethers.utils.keccak256(signedData)
    }
}

export default new TransactionManager()
