import fetch from 'node-fetch'
import {
    Circuit,
    formatProofForVerifierContract,
    verifyProof,
} from '@unirep/circuits'
import { genIdentity, genIdentityCommitment } from '@unirep/crypto'
import { genEpochKey, genUserStateFromContract } from '@unirep/unirep'

export const getInvitationCode = async (t) => {
    const r = await fetch(`${t.context.url}/api/genInvitationCode?code=ffff`)
    t.is(r.status, 200)
    const signupCode = await r.json()
    return signupCode
}

export const waitForBackendBlock = async (t, blockNumber) => {
    for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const latestBlock = await fetch(`${t.context.url}/api/block`).then(
            (r) => r.json()
        )
        if (latestBlock < blockNumber) continue
        break
    }
}

export const signUp = async (t) => {
    const iden = genIdentity()
    const commitment = genIdentityCommitment(iden)
        .toString(16)
        .padStart(64, '0')
    const currentEpoch = await t.context.unirep.currentEpoch()

    const params = new URLSearchParams({
        commitment,
    })
    const r = await fetch(`${t.context.url}/api/signup?${params}`)
    const data = await r.json()
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    t.assert(/^0x[0-9a-fA-F]{64}$/.test(data.transaction))
    t.is(currentEpoch.toString(), data.epoch.toString())
    t.is(r.status, 200)

    await waitForBackendBlock(t, receipt.blockNumber)
    // sign in should success
    await signIn(t)

    return { iden, commitment }
}

export const airdrop = async (t) => {
    const userState = await genUserStateFromContract(
        t.context.unirepSocial.provider,
        t.context.unirep.address,
        t.context.iden
    )
    const { proof, publicSignals } = await userState.genUserSignUpProof(
        t.context.attesterId
    )
    const isValid = await verifyProof(
        Circuit.proveUserSignUp,
        proof,
        publicSignals
    )
    t.true(isValid)

    const r = await fetch(`${t.context.url}/api/airdrop`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            proof: formatProofForVerifierContract(proof),
            publicSignals,
        }),
    })
    const data = await r.json()
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    await waitForBackendBlock(t, receipt.blockNumber)
    t.pass()
}

export const signIn = async (t) => {
    // now try signing in using this identity
    const commitment = t.context.commitment
    const params = new URLSearchParams({
        commitment,
    })
    const r = await fetch(`${t.context.url}/api/signin?${params}`)
    if (!r.ok) {
        throw new Error(`/signin error`)
    }
    t.is(r.status, 200)
}

export const getSpent = async (t) => {
    const currentEpoch = Number(await t.context.unirep.currentEpoch())
    const epks: string[] = []
    for (let i = 0; i < t.context.constants.EPOCH_KEY_NONCE_PER_EPOCH; i++) {
        epks.push(
            genEpochKey(
                t.context.iden.identityNullifier,
                currentEpoch,
                i,
                t.context.epochTreeDepth
            ).toString(16)
        )
    }
    const paramStr = epks.join('_')
    const r = await fetch(
        `${t.context.url}/api/records/${paramStr}?spentonly=true`
    )
    const data = await r.json()
    if (!r.ok) {
        throw new Error(`/records error ${JSON.stringify(data)}`)
    }
    let spent = 0
    for (var i = 0; i < data.length; i++) {
        spent = spent + data[i].spent
    }
    return spent
}

const genReputationProof = async (t) => {
    const userState = await genUserStateFromContract(
        t.context.unirepSocial.provider,
        t.context.unirep.address,
        t.context.iden
    )
    {
        // this might be unnecessary, here for the `getSpent` call below
        const blockNumber = await t.context.provider.getBlockNumber()
        await waitForBackendBlock(t, blockNumber)
    }

    // find valid nonce starter
    // gen proof
    const nonceList = [] as any[]
    const epkNonce = 0
    const proveAmount = t.context.proveAmount
    const nonceStarter: number = await getSpent(t)

    for (let i = 0; i < proveAmount; i++) {
        nonceList.push(BigInt(nonceStarter + i))
    }
    for (
        let i = proveAmount;
        i < t.context.constants.maxReputationBudget;
        i++
    ) {
        nonceList.push(BigInt(-1))
    }
    const { proof, publicSignals } = await userState.genProveReputationProof(
        t.context.attesterId,
        epkNonce,
        proveAmount,
        BigInt(0),
        BigInt(0),
        nonceList
    )
    const isValid = await verifyProof(
        Circuit.proveReputation,
        proof,
        publicSignals
    )
    t.true(isValid)
    // we need to wait for the backend to process whatever block our provider is on
    const blockNumber = await t.context.provider.getBlockNumber()
    return {
        proof: formatProofForVerifierContract(proof),
        publicSignals,
        blockNumber,
    }
}

export const createPost = async (t) => {
    const proveAmount = t.context.constants.DEFAULT_POST_KARMA
    Object.assign(t.context, { ...t.context, proveAmount })
    const { blockNumber, proof, publicSignals } = await genReputationProof(t)
    await waitForBackendBlock(t, blockNumber)

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
        }),
    })

    const data = await r.json()
    const prevSpent = await getSpent(t)
    if (!r.ok) {
        throw new Error(`/post error ${JSON.stringify(data)}`)
    }
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const currentSpent = await getSpent(t)
        if (prevSpent + proveAmount !== currentSpent) continue
        t.is(prevSpent + proveAmount, currentSpent)

        const latestBlock = await fetch(`${t.context.url}/api/block`).then(
            (r) => r.json()
        )
        if (latestBlock < receipt.blockNumber) continue
        else break
    }
    return data
}

export const queryPost = async (t) => {
    for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const r = await fetch(
            `${t.context.url}/api/post/${t.context.transaction}`
        )
        if (r.status === 404) continue
        t.is(r.status, 200)
        return true
    }
}

export const createComment = async (t) => {
    const proveAmount = t.context.constants.DEFAULT_COMMENT_KARMA
    Object.assign(t.context, { ...t.context, proveAmount })
    const { blockNumber, proof, publicSignals } = await genReputationProof(t)
    await waitForBackendBlock(t, blockNumber)

    const r = await fetch(`${t.context.url}/api/comment`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            postId: t.context.postId,
            content: 'this is a comment!',
            publicSignals,
            proof,
        }),
    })
    const data = await r.json()
    const prevSpent = await getSpent(t)
    if (!r.ok) {
        throw new Error(`/comment error ${JSON.stringify(data)}`)
    }
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const currentSpent = await getSpent(t)
        if (prevSpent + proveAmount !== currentSpent) continue
        t.is(prevSpent + proveAmount, currentSpent)

        const latestBlock = await fetch(`${t.context.url}/api/block`).then(
            (r) => r.json()
        )
        if (latestBlock < receipt.blockNumber) continue
        else break
    }
    return data
}

export const vote = async (t) => {
    const proveAmount = t.context.upvote + t.context.downvote
    Object.assign(t.context, { ...t.context, proveAmount })
    const { blockNumber, proof, publicSignals } = await genReputationProof(t)
    await waitForBackendBlock(t, blockNumber)

    const r = await fetch(`${t.context.url}/api/vote`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            dataId: t.context.dataId,
            isPost: t.context.isPost,
            publicSignals,
            proof,
            upvote: t.context.upvote,
            downvote: t.context.downvote,
            receiver: t.context.receiver,
        }),
    })
    const data = await r.json()
    const prevSpent = await getSpent(t)
    if (!r.ok) {
        throw new Error(`/vote error ${JSON.stringify(data)}`)
    }
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const currentSpent = await getSpent(t)
        if (prevSpent + proveAmount !== currentSpent) continue
        t.is(prevSpent + proveAmount, currentSpent)

        const latestBlock = await fetch(`${t.context.url}/api/block`).then(
            (r) => r.json()
        )
        if (latestBlock < receipt.blockNumber) continue
        else break
    }
    t.pass()
}

export const epochTransition = async (t) => {
    const r = await fetch(`${t.context.url}/api/epochTransition`, {
        method: 'POST',
        headers: {
            authorization: 'NLmKDUnJUpc6VzuPc7Wm',
        },
    })
    t.is(r.status, 204)
}

export const userStateTransition = async (t) => {
    const userState = await genUserStateFromContract(
        t.context.unirepSocial.provider,
        t.context.unirep.address,
        t.context.iden
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
        },
    })
    const data = await r.json()
    if (!r.ok) {
        throw new Error(`/userStateTransition error ${JSON.stringify(data)}`)
    }
    const receipt = await t.context.provider.waitForTransaction(
        data.transaction
    )

    await waitForBackendBlock(t, receipt.blockNumber)
    t.pass()
}
