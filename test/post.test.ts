import test from 'ava'
import { startServer } from './environment'
import fetch from 'node-fetch'
import {
  genIdentity,
  genIdentityCommitment,
  unSerialiseIdentity
} from '@unirep/crypto'
import {
  genEpochKey,
  genUserStateFromContract
} from '@unirep/unirep';

test.before(async (t) => {
  const context = await startServer()
  Object.assign(t.context, context)
})

const formatProofForVerifierContract = (_proof: any) => {
    return ([
        _proof.pi_a[0],
        _proof.pi_a[1],
        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],
        _proof.pi_c[0],
        _proof.pi_c[1],
    ]).map((x) => x.toString());
};

test.skip('should create a post', async (t: any) => {
  const iden = genIdentity()
  const commitment = genIdentityCommitment(iden).toString(16)
  const currentEpoch = await t.context.unirep.currentEpoch()
  const epochKeyNonce = 0
  const epk = genEpochKey(
    iden.identityNullifier,
    currentEpoch,
    epochKeyNonce,
    t.context.epochTreeDepth
  ).toString(16)

  const params = new URLSearchParams({
    commitment: t.context.constants.identityCommitmentPrefix + Buffer.from(commitment, 'hex').toString('base64'),
    epk,
  })
  {
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    await t.context.provider.waitForTransaction(data.transaction)
  }
  let userState = await genUserStateFromContract(
    t.context.unirepSocial.provider,
    t.context.unirep.address,
    iden
  )

    const numEpochKeyNoncePerEpoch = await t.context.unirep.numEpochKeyNoncePerEpoch()

    const attesterId = BigInt(1)

    const rep = userState.getRepByAttester(attesterId);
    const nonceList = [] as any[]
    const epochSpent = 50
    const proveKarmaAmount = 5
    console.log(epochKeyNonce, proveKarmaAmount)
    console.log(rep.posRep, rep.negRep)
    if (epochKeyNonce + proveKarmaAmount < Number(rep.posRep) - Number(rep.negRep)){
        console.error('Error: Not enough reputation to spend')
    }
    for (let i = 0; i < proveKarmaAmount; i++) {
        nonceList.push( BigInt(epochKeyNonce + i) )
    }
    for (let i = proveKarmaAmount; i < t.context.constants.maxReputationBudget ; i++) {
        nonceList.push(BigInt(-1))
    }
    // find valid nonce starter
    // gen proof
    const epkNonce = 0
    const minRep = 5
    const proveGraffiti = BigInt(0);
    const graffitiPreImage = BigInt(0);
    const results = await userState.genProveReputationProof(
      BigInt(attesterId),
      epkNonce,
      5,
      // proveGraffiti,
      // graffitiPreImage,
      // nonceList
    )

    console.log(results)

    const formattedProof = formatProofForVerifierContract(results.proof)
    const encodedProof = Buffer.from(JSON.stringify(formattedProof)).toString('base64')
    const encodedPublicSignals = Buffer.from(JSON.stringify(results.publicSignals)).toString('base64')
    const proof = t.context.constants.reputationProofPrefix + encodedProof
    const publicSignals = t.context.constants.reputationPublicSignalsPrefix + encodedPublicSignals
    const r = await fetch(`${t.context.url}/api/post`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'test',
        content: 'some content!',
        publicSignals,
        proof,
      })
    })
  const data = await r.json()
  console.log(data)
  console.log(data)
  t.pass()
})
