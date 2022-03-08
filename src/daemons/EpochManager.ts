import { ethers } from 'ethers'
import {
  UNIREP,
  DEPLOYER_PRIV_KEY,
  UNIREP_SOCIAL,
  DEFAULT_ETH_PROVIDER,
  UNIREP_ABI,
  UNIREP_SOCIAL_ABI
} from '../constants';

export class EpochManager {
    timer: NodeJS.Timeout | null = null
    unirepContract = new ethers.Contract(UNIREP, UNIREP_ABI, DEFAULT_ETH_PROVIDER)
    unirepSocialContract = new ethers.Contract(UNIREP_SOCIAL, UNIREP_SOCIAL_ABI, DEFAULT_ETH_PROVIDER);

    async updateWatch() {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
        // load the last transition time
        const nextTransition = await this.nextTransition()
        const waitTime = Math.max((nextTransition - +(new Date())/1000) * 1000, 0)
        console.log(`Next epoch transition in ${waitTime / (60 * 60 * 1000)} hours`)
        this.timer = setTimeout(() => {
            this.timer = null
            this.tryTransition()
        }, waitTime) // if it's in the past make wait time 0
        return waitTime
    }

    async nextTransition() {
      const [ lastTransition, epochLength ] = await Promise.all([
          this.unirepContract.latestEpochTransitionTime(),
          this.unirepContract.epochLength(),
      ])
      return lastTransition.toNumber() + epochLength.toNumber()
    }

    async tryTransition() {
        try {
            await this.doEpochTransition()
        } catch (err) {
            console.log(`State transition error: ${err}`)
        }
        // wait for 10 seconds before trying again or rescheduling
        await new Promise(r => setTimeout(r, 10000))
        this.updateWatch()
    }

    async doEpochTransition() {
        const wallet = new ethers.Wallet(DEPLOYER_PRIV_KEY, DEFAULT_ETH_PROVIDER)
        const currentEpoch = await this.unirepContract.currentEpoch()
        const tx = await this.unirepContract
            .connect(wallet)
            .beginEpochTransition()
            .then((t: any) => t.wait())
        console.log('Transaction hash:', tx.hash)
        console.log('End of epoch:', currentEpoch.toString())
    }
}

export default new EpochManager()