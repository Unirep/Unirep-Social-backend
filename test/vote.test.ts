import test from 'ava'
import { startServer } from './environment'

import { 
    createComment, 
    createPost, 
    signIn, 
    signUp, 
    vote 
} from './utils';

test.before(async (t) => {
    const context = await startServer()
    Object.assign(t.context, context)
})

test('should vote on a post', async (t: any) => {
    // sign up first user
    const user1 = await signUp(t)
    Object.assign(t.context, { ...t.context, iden: user1.iden })
    await signIn(t)

    // first create a post
    const { post, transaction } = await createPost(t)

    // sign up second user
    const user2 = await signUp(t)
    Object.assign(t.context, { ...t.context, iden: user2.iden })
    await signIn(t)
    
    // upvote the post
    {
        const upvote = 5
        const downvote = 0
        const dataId = transaction
        const receiver = post.epochKey.toString(16)
        Object.assign(t.context, { ...t.context, 
            upvote,
            downvote,
            dataId,
            receiver,
            isPost: true
        })
        await vote(t)
    }
  

    // downvote the post
    {
        const upvote = 0
        const downvote = 2
        const dataId = transaction
        const receiver = post.epochKey.toString(16)
        Object.assign(t.context, { ...t.context, 
            upvote,
            downvote,
            dataId,
            receiver,
            isPost: true
        })
        await vote(t)
    }
    t.pass()
})

test('should vote on comment', async (t: any) => {
    // sign up first user
    const user1 = await signUp(t)
    Object.assign(t.context, { ...t.context, iden: user1.iden })
    await signIn(t)

    // first create a post
    const post = await createPost(t)
    Object.assign(t.context, { ...t.context, postId: post.transaction })
    
    // leave a comment
    const { comment, transaction } = await createComment(t)

    // sign up second user
    const user2 = await signUp(t)
    Object.assign(t.context, { ...t.context, iden: user2.iden })
    await signIn(t)
    
    // upvote the comment
    {
        const upvote = 4
        const downvote = 0
        const dataId = transaction
        const receiver = comment.epochKey.toString(16)
        Object.assign(t.context, { ...t.context, 
            upvote,
            downvote,
            dataId,
            receiver,
            isPost: false
        })
        await vote(t)
    }
  

    // downvote the comment
    {
        const upvote = 0
        const downvote = 1
        const dataId = transaction
        const receiver = comment.epochKey.toString(16)
        Object.assign(t.context, { ...t.context, 
            upvote,
            downvote,
            dataId,
            receiver,
            isPost: false
        })
        await vote(t)
    }
    t.pass()
})
