import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong password', async () => {
    const hash = await hashPassword('a-long-private-password', Buffer.alloc(16, 7))

    await expect(verifyPassword('a-long-private-password', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false)
  })

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false)
    await expect(verifyPassword('anything', 'scrypt$1$8$1$salt$hash')).resolves.toBe(false)
  })
})
