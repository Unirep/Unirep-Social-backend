import { TableData } from 'anondb'
import schema from './syncSchema'

export default [
    {
        name: 'AccountNonce',
        primaryKey: 'address',
        rows: [
            ['address', 'String'],
            ['nonce', 'Int'],
        ],
    },
    {
        name: 'AccountTransaction',
        primaryKey: 'signedData',
        rows: [
            ['signedData', 'String'],
            ['address', 'String'],
            ['nonce', 'Int'],
        ],
    },
    {
        name: 'InvitationCode',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['code', 'String'],
        ],
    },
    {
        name: 'Report',
        rows: [
            {
                name: 'createdAt',
                type: 'Int',
                default: () => +new Date(),
            },
            ['issue', 'String'],
            ['email', 'String', { optional: true }],
        ],
    },
    ...schema,
] as TableData[]
