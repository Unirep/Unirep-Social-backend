import { TableData } from 'anondb'
import { nanoid } from 'nanoid'

const schema = [
    {
        name: 'SynchronizerState',
        rows: [
            ['latestProcessedBlock', 'Int'],
            ['latestProcessedTransactionIndex', 'Int'],
            ['latestProcessedEventIndex', 'Int'],
            ['latestCompleteBlock', 'Int'],
        ],
    },
    {
        name: 'Proof',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['index', 'Int'],
            ['epoch', 'Int', { optional: true }],
            ['toEpochKey', 'Int', { optional: true }],
            ['proof', 'String', { optional: true }],
            ['publicSignals', 'String', { optional: true }],
            ['valid', 'Bool', { optional: true }],
            ['spent', 'Bool', { optional: true }],
            ['event', 'String'],
            ['transactionHash', 'String'],
            ['blindedUserState', 'String', { optional: true }],
            ['blindedHashChain', 'String', { optional: true }],
            ['globalStateTree', 'String', { optional: true }],
            ['outputBlindedUserState', 'String', { optional: true }],
            ['outputBlindedHashChain', 'String', { optional: true }],
            ['inputBlindedUserState', 'String', { optional: true }],
            ['proofIndexRecords', 'Object', { optional: true }],
        ],
    },
    {
        name: 'Attestation',
        rows: [
            ['epoch', 'Int', { optional: true }],
            ['epochKey', 'String', { optional: true }],
            ['epochKeyToHashchainMap', 'String', { optional: true }],
            // ['index', 'Int'],
            ['transactionHash', 'String', { optional: true }],
            ['attester', 'String', { optional: true }],
            ['proofIndex', 'Int', { optional: true }],
            ['attesterId', 'Int', { optional: true }],
            ['posRep', 'Int', { optional: true }],
            ['negRep', 'Int', { optional: true }],
            ['graffiti', 'String', { optional: true }],
            ['signUp', 'Bool', { optional: true }],
            ['hash', 'String'],
            ['valid', 'Bool', { optional: true }],
        ],
    },
    {
        name: 'GSTLeaf',
        rows: [
            ['epoch', 'Int'],
            ['transactionHash', 'String'],
            ['hash', 'String'],
            ['index', 'Int'],
        ],
    },
    {
        name: 'GSTRoot',
        rows: [
            ['epoch', 'Int'],
            ['root', 'String'],
        ],
    },
    {
        name: 'Epoch',
        rows: [
            ['number', 'Int', { unique: true }],
            ['sealed', 'Bool'],
            ['epochRoot', 'String', { optional: true }],
        ],
    },
    {
        name: 'Nullifier',
        rows: [
            ['epoch', 'Int'],
            ['nullifier', 'String', { unique: true }],
            ['transactionHash', 'String', { optional: true }],
            {
                name: 'confirmed',
                type: 'Bool',
                default: () => true,
            },
        ],
    },
    {
        name: 'Record',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['to', 'String'],
            ['from', 'String'],
            ['upvote', 'Int'],
            ['downvote', 'Int'],
            ['epoch', 'Int'],
            ['action', 'String'],
            ['data', 'String', { optional: true }],
            ['transactionHash', 'String', { optional: true }],
            {
                name: 'confirmed',
                type: 'Bool',
                default: () => true,
            },
        ],
    },
    {
        name: 'EpkRecord',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['epk', 'String'],
            ['posRep', 'Int'],
            ['negRep', 'Int'],
            ['spent', 'Int'],
            ['epoch', 'Int'],
        ],
    },
    {
        name: 'Vote',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['transactionHash', 'String'],
            ['epoch', 'Int'],
            ['voter', 'String'],
            ['receiver', 'String'],
            ['posRep', 'Int'],
            ['negRep', 'Int'],
            ['graffiti', 'String', { optional: true }],
            ['overwriteGraffiti', 'Bool', { optional: true }],
            ['postId', 'String', { optional: true }],
            ['commentId', 'String', { optional: true }],
            ['status', 'Int'],
        ],
    },
    {
        name: 'Comment',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['postId', 'String'],
            ['transactionHash', 'String', { optional: true }],
            ['content', 'String', { optional: true }],
            ['hashedContent', 'String', { optional: true }],
            ['epoch', 'Int'],
            ['epochKey', 'String'],
            ['proofIndex', 'Int', { optional: true }],
            ['proveMinRep', 'Bool', { optional: true }],
            ['minRep', 'Int', { optional: true }],
            {
                name: 'posRep',
                type: 'Int',
                default: () => 0,
            },
            {
                name: 'negRep',
                type: 'Int',
                default: () => 0,
            },
            {
                name: 'totalRep',
                type: 'Int',
                default: () => 0,
            },
            ['status', 'Int'],
        ],
    },
    {
        name: 'Post',
        rows: [
            ['transactionHash', 'String', { optional: true }],
            ['title', 'String', { optional: true }],
            ['content', 'String', { optional: true }],
            ['hashedContent', 'String', { optional: true }],
            ['epoch', 'Int'],
            ['epochKey', 'String'],
            ['proofIndex', 'Int', { optional: true }],
            ['proveMinRep', 'Bool', { optional: true }],
            ['minRep', 'Int', { optional: true }],
            {
                name: 'posRep',
                type: 'Int',
                default: () => 0,
            },
            {
                name: 'negRep',
                type: 'Int',
                default: () => 0,
            },
            {
                name: 'totalRep',
                type: 'Int',
                default: () => 0,
            },
            ['status', 'Int'],
            {
                name: 'commentCount',
                type: 'Int',
                default: () => 0,
            },
        ],
    },
    {
        name: 'UserSignUp',
        rows: [
            ['transactionHash', 'String'],
            ['commitment', 'String'],
            ['epoch', 'Int'],
        ],
    },
]

export default schema.map((obj) => ({
    primaryKey: '_id',
    ...obj,
    rows: [
        ...obj.rows,
        {
            name: '_id',
            type: 'String',
            default: () => nanoid(),
        },
    ],
})) as TableData[]
