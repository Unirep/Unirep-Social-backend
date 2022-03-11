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
  genReputationNullifier
} from '@unirep/unirep';
import {
  Circuit,
  formatProofForVerifierContract,
  verifyProof
} from '@unirep/circuits'

test.before(async (t) => {
  const context = await startServer()
  Object.assign(t.context, context)
})

const createPost = async (t) => {
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
  // do the airdrop
  {
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
  }

  const attesterId = BigInt(1)

  const rep = userState.getRepByAttester(attesterId);
  const nonceList = [] as any[]
  // find valid nonce starter
  // gen proof
  const epkNonce = 1
  const proveAmount = 5
  let nonceStarter: number = -1
  for (let n = 0; n < Number(rep.posRep) - Number(rep.negRep); n++) {
    const reputationNullifier = genReputationNullifier(
      iden.identityNullifier,
      currentEpoch,
      n,
      attesterId
    )
    if (!userState.nullifierExist(reputationNullifier)) {
      nonceStarter = n
      break
    }
  }
  if (nonceStarter == -1) {
    console.error('Error: All nullifiers are spent')
  }
  if (nonceStarter + proveAmount > Number(rep.posRep) - Number(rep.negRep)){
    console.error('Error: Not enough reputation to spend')
  }
  for (let i = 0; i < proveAmount; i++) {
    nonceList.push( BigInt(nonceStarter + i) )
  }
  for (let i = proveAmount ; i < t.context.constants.maxReputationBudget ; i++) {
    nonceList.push(BigInt(-1))
  }
  const { proof, publicSignals } = await userState.genProveReputationProof(
    BigInt(attesterId),
    epkNonce,
    5,
    BigInt(0),
    BigInt(0),
    nonceList,
  )

  const r = await fetch(`${t.context.url}/api/post`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'test',
      content: 'some content!',
      publicSignals,
      proof: formatProofForVerifierContract(proof),
    })
  })
  const data = await r.json()
  await t.context.provider.waitForTransaction(data.transaction)
  return data
}

test('should create a comment', async (t: any) => {
  // first create a post
  const { post, transaction } = await createPost(t)
  // then make an identity and leave a comment
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
  // do the airdrop
  {
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
  }


  const attesterId = BigInt(1)

  const rep = userState.getRepByAttester(attesterId);
  const nonceList = [] as any[]
  // find valid nonce starter
  // gen proof
  const epkNonce = 1
  const proveAmount = 3
  let nonceStarter: number = -1
  for (let n = 0; n < Number(rep.posRep) - Number(rep.negRep); n++) {
    const reputationNullifier = genReputationNullifier(
      iden.identityNullifier,
      currentEpoch,
      n,
      attesterId
    )
    if (!userState.nullifierExist(reputationNullifier)) {
      nonceStarter = n
      break
    }
  }
  if (nonceStarter == -1) {
    console.error('Error: All nullifiers are spent')
  }
  if (nonceStarter + proveAmount > Number(rep.posRep) - Number(rep.negRep)){
    console.error('Error: Not enough reputation to spend')
  }
  for (let i = 0; i < proveAmount; i++) {
    nonceList.push( BigInt(nonceStarter + i) )
  }
  for (let i = proveAmount ; i < t.context.constants.maxReputationBudget ; i++) {
    nonceList.push(BigInt(-1))
  }
  const { proof, publicSignals } = await userState.genProveReputationProof(
    BigInt(attesterId),
    epkNonce,
    5,
    BigInt(0),
    BigInt(0),
    nonceList,
  )

  const r = await fetch(`${t.context.url}/api/comment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      postId: transaction,
      content: 'this is a comment!',
      publicSignals,
      proof: formatProofForVerifierContract(proof),
    })
  })
  const data = await r.json()
  await t.context.provider.waitForTransaction(data.transaction)
  t.pass()
})
