import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('uses a dotenv-safe format and verifies the correct password', async () => {
    const hash = await hashPassword('a-long-private-password', Buffer.alloc(16, 7))

    expect(hash).not.toContain('$')
    expect(hash.split(':')).toHaveLength(6)
    await expect(verifyPassword('a-long-private-password', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false)
  })

  it('continues to verify legacy dollar-delimited hashes', async () => {
    const hash = await hashPassword('a-long-private-password', Buffer.alloc(16, 7))
    const legacyHash = hash.replaceAll(':', '$')

    await expect(verifyPassword('a-long-private-password', legacyHash)).resolves.toBe(true)
  })

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false)
    await expect(verifyPassword('anything', 'scrypt:1:8:1:salt:hash')).resolves.toBe(false)
    await expect(verifyPassword('anything', 'scrypt$1$8$1$salt$hash')).resolves.toBe(false)
  })
})
