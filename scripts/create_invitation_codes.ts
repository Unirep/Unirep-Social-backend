import fs from 'fs'
import path from 'path'
import InvitationCode from '../src/models/invitationCode'

const [,,invitationCodePath] = process.argv

;(async () => {
  const finalPath = path.isAbsolute(invitationCodePath) ? invitationCodePath : path.join(process.cwd(), invitationCodePath)
  const codes = fs.readFileSync(finalPath).toString().split('\n')
  console.log(`Creating ${codes.length} codes in 3 seconds`)
  await new Promise(r => setTimeout(r, 3000))
  await InvitationCode.create(codes.map(code => ({ code })))
  console.log(`Created ${codes.length} codes`)
})()
