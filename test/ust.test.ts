import test from 'ava'
import { startServer } from './environment'
import Epoch from '../src/database/models/epoch'

import {
    epochTransition,
    signUp,
    userStateTransition
} from './utils'

const EPOCH_LENGTH = 20000

test.before(async (t) => {
    const context = await startServer({ epochLength: EPOCH_LENGTH / 1000 })
    Object.assign(t.context, context)
})

test('should do user state transition', async (t: any) => {
    // sign up user
    const { iden } = await signUp(t)
    Object.assign(t.context, { ...t.context, iden })

    await new Promise(r => setTimeout(r, EPOCH_LENGTH))

    // execute the epoch transition
    const prevEpoch = await t.context.unirep.currentEpoch()
    await epochTransition(t)
    for (let x = 0; x < 50; x++) {
        await new Promise(r => setTimeout(r, 1000))
        try {
            const findEpoch = await Epoch.exists({ number: Number(prevEpoch) })
            if (findEpoch) break
        } catch (_) { }
    }
    // user state transition
    await userStateTransition(t)
    t.pass()
})
