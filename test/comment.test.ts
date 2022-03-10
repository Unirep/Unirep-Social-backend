import test from 'ava'
import { startServer } from './environment'

import { 
    createComment, 
    createPost, 
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
    Object.assign(t.context, { ...t.context, postId: transaction })
    
    // leave a comment
    await createComment(t)
    t.pass()
})
