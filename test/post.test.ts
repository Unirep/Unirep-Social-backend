import test from 'ava'
import { startServer } from './environment'

import {
    createPost,
    queryPost,
    signIn,
    signUp
} from './utils'

test.before(async (t) => {
    const context = await startServer()
    Object.assign(t.context, context)
})

test('should create a post', async (t: any) => {
    const { iden } = await signUp(t)
    Object.assign(t.context, { ...t.context, iden })
    await signIn(t)

    const { transaction } = await createPost(t)
    Object.assign(t.context, { ...t.context, transaction })
    const exist = await queryPost(t)
    t.true(exist)
    t.pass()
})
