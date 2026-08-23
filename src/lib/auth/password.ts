import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const HASH_BYTES = 64
const MAX_MEMORY = 64 * 1024 * 1024

function deriveKey(password: string, salt: Buffer, length = HASH_BYTES) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEMORY,
    }, (error, key) => {
      if (error) reject(error)
      else resolve(key as Buffer)
    })
  })
}

export async function hashPassword(password: string, salt = randomBytes(16)) {
  const key = await deriveKey(password, salt)
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, n, r, p, saltValue, hashValue, ...extra] = encodedHash.split('$')
  if (
    algorithm !== 'scrypt'
    || Number(n) !== SCRYPT_N
    || Number(r) !== SCRYPT_R
    || Number(p) !== SCRYPT_P
    || !saltValue
    || !hashValue
    || extra.length > 0
  ) {
    return false
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(hashValue, 'base64url')
    if (salt.length < 16 || expected.length !== HASH_BYTES) return false

    const actual = await deriveKey(password, salt, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
