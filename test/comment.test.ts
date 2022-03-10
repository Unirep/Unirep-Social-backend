import test from 'ava'
import { startServer } from './environment'

import { 
    createComment, 
    createPost, 
    queryPost, 
    signIn, 
    signUp 
} from './utils';

test.before(async (t) => {
    const context = await startServer()
    Object.assign(t.context, context)
})

test('should create a comment', async (t: any) => {
    // sign up and sign in user
    const { iden } = await signUp(t)
    Object.assign(t.context, { ...t.context, iden })
    await signIn(t)

    // first create a post
    const { transaction } = await createPost(t)
    Object.assign(t.context, { ...t.context, transaction })
    const exist = await queryPost(t)
    t.true(exist)
    
    // leave a comment
    Object.assign(t.context, { ...t.context, postId: transaction })
    await createComment(t)
    t.pass()
})

