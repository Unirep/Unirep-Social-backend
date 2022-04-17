import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

import mongoose from 'mongoose'
import InvitationCode from '../src/models/invitationCode'

const [,,invitationCodePath] = process.argv

;(async () => {
  if (!process.env.MONGO_URL) {
    console.log(`MONGO_URL is not set`)
    process.exit(1)
  }
  mongoose.connect(process.env.MONGO_URL)
  // Bind connection to error event (to get notification of connection errors)
  mongoose.connection.on(
      'error',
      console.error.bind(console, 'MongoDB connection error:')
  )
  const finalPath = path.isAbsolute(invitationCodePath) ? invitationCodePath : path.join(process.cwd(), invitationCodePath)
  const codes = fs.readFileSync(finalPath).toString().split('\n')
  console.log(`Creating ${codes.length} codes in 3 seconds`)
  await new Promise(r => setTimeout(r, 3000))
  await InvitationCode.insertMany(codes.map(code => ({ code })))
  console.log(`Created ${codes.length} codes`)
  process.exit(0)
})()
