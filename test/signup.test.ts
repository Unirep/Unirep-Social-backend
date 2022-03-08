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
import {
  Circuit,
  formatProofForVerifierContract,
  verifyProof
} from '@unirep/circuits'

test.before(async (t) => {
  const context = await startServer()
  Object.assign(t.context, context)
})

test('should get signup code', async (t: any) => {
  let signupCode: string
  {
    const r = await fetch(`${t.context.url}/api/genInvitationCode?code=ffff`)
    t.assert(r.status === 200)
    signupCode = await r.json()
  }
  {
    const r = await fetch(`${t.context.url}/api/genInvitationCode/${signupCode}`)
    t.assert(r.status === 200)
  }
})

test('should sign up', async (t: any) => {
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
  const r = await fetch(`${t.context.url}/api/signup?${params}`)
  const data = await r.json()
  await t.context.provider.waitForTransaction(data.transaction)
  t.assert(/^0x[0-9a-fA-F]{64}$/.test(data.transaction))
  t.is(currentEpoch.toString(), data.epoch.toString())
  t.is(r.status, 200)
})

test('should airdrop', async (t: any) => {
  const iden = genIdentity()
  const commitment = genIdentityCommitment(iden)
    .toString(16)
    .padStart(64, '0')
  const currentEpoch = await t.context.unirep.currentEpoch()
  const epochKeyNonce = 0
  const epk = genEpochKey(
    iden.identityNullifier,
    currentEpoch,
    epochKeyNonce,
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
  const userState = await genUserStateFromContract(
    t.context.unirepSocial.provider,
    t.context.unirep.address,
    iden,
  )
  const { proof, publicSignals } = await userState.genUserSignUpProof(BigInt(1))
  const isValid = await verifyProof(Circuit.proveUserSignUp, proof, publicSignals)
  if (!isValid) {
    console.error('Error: user sign up proof generated is not valid!')
    return
  }
  const r = await fetch(`${t.context.url}/api/airdrop`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      proof: formatProofForVerifierContract(proof),
      publicSignals,
      userState,
    })
  })
  const data = await r.json()
  await t.context.provider.waitForTransaction(data.transaction)
  t.pass()
})

test('should sign up many in parallel', async (t: any) => {
  const signup = async () => {
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
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }
  const promises = [] as Promise<any>[]
  for (let x = 0; x < 10; x++) {
    promises.push(signup())
  }
  await Promise.all(promises)
  t.pass()
})

test('should sign in', async (t: any) => {
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

  {
    const params = new URLSearchParams({
      commitment,
      epk,
    })
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }

  // now try signing in using this identity
  const params = new URLSearchParams({
    commitment,
  })
  const r = await fetch(`${t.context.url}/api/signin?${params}`)
  const data = await r.text()
  console.log(data)
  t.pass()
})
