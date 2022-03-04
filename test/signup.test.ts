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
  const { unirep, unirepSocial, identityCommitmentPrefix, provider } = await startServer()
  Object.assign(t.context, {
    unirep,
    unirepSocial,
    identityCommitmentPrefix,
    provider,
  })
})

test('should get signup code', async (t: any) => {
  let signupCode: string
  {
    const r = await fetch('http://localhost:5000/api/genInvitationCode?code=ffff')
    t.assert(r.status === 200)
    signupCode = await r.json()
  }
  {
    const r = await fetch(`http://localhost:5000/api/genInvitationCode/${signupCode}`)
    t.assert(r.status === 200)
  }
})

test('should sign up', async (t: any) => {
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
  const r = await fetch(`http://localhost:5000/api/signup?${params}`)
  const data = await r.json()
  t.assert(/^0x[0-9a-fA-F]{64}$/.test(data.transaction))
  t.is(currentEpoch.toString(), data.epoch.toString())
  t.is(r.status, 200)
})

test('should sign up many in parallel', async (t: any) => {
  const signup = async () => {
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
    const r = await fetch(`http://localhost:5000/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }
  const promises = [] as Promise<any>[]
  for (let x = 0; x < 30; x++) {
    promises.push(signup())
  }
  await Promise.all(promises)
  t.pass()
})

test('should sign in', async (t: any) => {
  const iden = genIdentity()
  const commitment = genIdentityCommitment(iden).toString(16)
  const currentEpoch = await t.context.unirep.currentEpoch()
  const epk = genEpochKey(
    iden.identityNullifier,
    currentEpoch,
    0,
    t.context.epochTreeDepth
  ).toString(16)

  {
    const params = new URLSearchParams({
      commitment: t.context.identityCommitmentPrefix + Buffer.from(commitment, 'hex').toString('base64'),
      epk,
    })
    const r = await fetch(`http://localhost:5000/api/signup?${params}`)
    const data = await r.json()
    t.context.provider.waitForTransaction(data.transaction)
  }

  // now try signing in using this identity
  const params = new URLSearchParams({
    commitment: t.context.identityCommitmentPrefix + Buffer.from(commitment, 'hex').toString('base64'),
  })
  const r = await fetch(`http://localhost:5000/api/signin?${params}`)
  const data = await r.text()
  console.log(data)
  t.pass()
})
