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
  const { unirep, unirepSocial, identityCommitmentPrefix } = await startServer()
  Object.assign(t.context, {
    unirep,
    unirepSocial,
    identityCommitmentPrefix,
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
  t.assert(r.status === 200)
})
