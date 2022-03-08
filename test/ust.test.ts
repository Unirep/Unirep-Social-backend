import test from 'ava'
import { startServer } from './environment'
import fetch from 'node-fetch'
import {
  genIdentity,
  genIdentityCommitment,
} from '@unirep/crypto'
import {
  genEpochKey,
  genUserStateFromContract,
} from '@unirep/unirep'

const EPOCH_LENGTH = 20000

test.before(async (t) => {
  const context = await startServer({ epochLength: EPOCH_LENGTH / 1000 })
  Object.assign(t.context, context)
})

test('should do user state transition', async (t: any) => {
  const iden = genIdentity()
  const commitment = genIdentityCommitment(iden)
    .toString(16)
    .padStart(64, '0')
  const currentEpoch = await t.context.unirep.currentEpoch()
  const epk = genEpochKey(
    iden.identityNullifier,
    currentEpoch,
    0,
    t.context.epochTreeDepth
  ).toString(16)

  const params = new URLSearchParams({
    commitment,
    epk,
  })
  {
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }

  await new Promise(r => setTimeout(r, EPOCH_LENGTH))

  // execute the epoch transition
  {
    const r = await fetch(`${t.context.url}/api/epochTransition`, {
      method: 'POST',
      headers: {
        authorization: 'NLmKDUnJUpc6VzuPc7Wm',
      }
    })
    t.is(await r.text(), '"epoch transition done."')
  }

  const userState = await genUserStateFromContract(
    t.context.unirepSocial.provider,
    t.context.unirep.address,
    iden,
  )

  const results = await userState.genUserStateTransitionProofs()
  const fromEpoch = userState.latestTransitionedEpoch

  const r = await fetch(`${t.context.url}/api/userStateTransition`, {
    method: 'POST',
    body: JSON.stringify({
      results,
      fromEpoch,
    }),
    headers: {
      'content-type': 'application/json',
    }
  })
  const data = await r.json()
  await t.context.provider.waitForTransaction(data.transaction)
  t.pass()

})
