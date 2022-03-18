import { ethers } from 'ethers'
import { UNIREP_ABI, UNIREP, DEFAULT_ETH_PROVIDER } from '../constants'
import TransactionManager from '../daemons/TransactionManager'

const epochTransition = async (req: any, res: any) => {
    if (req.headers.authorization !== 'NLmKDUnJUpc6VzuPc7Wm') {
        res.status(401).json({
            info: 'Not authorized',
        })
        return
    }
    const unirepContract = new ethers.Contract(
        UNIREP,
        UNIREP_ABI,
        DEFAULT_ETH_PROVIDER
    )

    const calldata = unirepContract.interface.encodeFunctionData(
        'beginEpochTransition',
        []
    )
    await TransactionManager.queueTransaction(unirepContract.address, calldata)
    res.status(204).end()
}

export default {
    epochTransition,
}
