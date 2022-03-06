import test from 'ava'
import { startServer } from './environment'
import fetch from 'node-fetch'
import {
  genIdentity,
  genIdentityCommitment,
} from '@unirep/crypto'
import {
  genEpochKey,
} from '@unirep/unirep'

test.before(async (t) => {
  const context = await startServer()
  Object.assign(t.context, context)
})

test('should create a post', async (t: any) => {
  const iden = genIdentity()
  const commitment = genIdentityCommitment(iden).toString(16)
  const currentEpoch = await t.context.unirep.currentEpoch()
  const epk = genEpochKey(
    iden.identityNullifier,
    currentEpoch,
    0,
    t.context.epochTreeDepth
  ).toString(16)

  const params = new URLSearchParams({
    commitment: t.context.identityCommitmentPrefix + Buffer.from(commitment, 'hex').toString('base64'),
    epk,
  })
  {
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }
  // now we are signed up

  // proof, public signals
  console.log(iden)
  // const r = await fetch(`${t.context.url}`, {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     title: 'test',
  //     content: 'some content!',
  //
  //   })
  // })
  // const data = await r.json()
  // console.log(data)
  t.pass()
})
