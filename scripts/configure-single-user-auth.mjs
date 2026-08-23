import { randomBytes, scryptSync } from 'node:crypto'
import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const HASH_BYTES = 64
const MAX_MEMORY = 64 * 1024 * 1024

const username = process.env.APP_LOGIN_USERNAME?.trim()
const password = process.env.APP_LOGIN_PASSWORD
const secureCookie = process.env.APP_LOGIN_SECURE_COOKIE === 'true' ? 'true' : 'false'
delete process.env.APP_LOGIN_PASSWORD

if (!username || username.length > 128) {
  throw new Error('Set APP_LOGIN_USERNAME to a username between 1 and 128 characters.')
}
if (!password || password.length < 12 || password.length > 1_024) {
  throw new Error('Set APP_LOGIN_PASSWORD to a password between 12 and 1024 characters.')
}

const envPath = resolve(process.argv[2] ?? '.env')
const tempPath = `${envPath}.auth-${process.pid}.tmp`
const existing = await readFile(envPath, 'utf8')
const salt = randomBytes(16)
const key = scryptSync(password, salt, HASH_BYTES, {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: MAX_MEMORY,
})
const passwordHash = [
  'scrypt',
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  salt.toString('base64url'),
  key.toString('base64url'),
].join(':')

const updates = new Map([
  ['APP_AUTH_USERNAME', username],
  ['APP_AUTH_PASSWORD_HASH', passwordHash],
  ['APP_AUTH_SECRET', randomBytes(32).toString('base64url')],
  ['APP_AUTH_SECURE_COOKIE', secureCookie],
])
const seen = new Set()
const lines = existing.replace(/\r\n/g, '\n').split('\n')
const output = []

for (const line of lines) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)
  const keyName = match?.[1]
  if (!keyName || !updates.has(keyName)) {
    output.push(line)
    continue
  }
  if (seen.has(keyName)) continue

  output.push(`${keyName}=${JSON.stringify(updates.get(keyName))}`)
  seen.add(keyName)
}

for (const [keyName, value] of updates) {
  if (!seen.has(keyName)) output.push(`${keyName}=${JSON.stringify(value)}`)
}

await writeFile(tempPath, `${output.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 })
await chmod(tempPath, 0o600)
await rename(tempPath, envPath)
await chmod(envPath, 0o600)

console.log(`Single-user authentication configured for ${username}.`)
console.log('Rebuild and restart the application to activate the new credentials.')
