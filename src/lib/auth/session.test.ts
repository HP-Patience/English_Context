import { describe, expect, it } from 'vitest'

import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from './session'

const secret = 'test-secret-that-is-at-least-thirty-two-characters'
const now = new Date('2026-08-23T12:00:00.000Z')

describe('signed authentication sessions', () => {
  it('returns the database user id from a valid token', async () => {
    const token = await createSessionToken('user_cuid_1', secret, now)

    await expect(verifySessionToken(token, secret, now)).resolves.toBe('user_cuid_1')
  })

  it('rejects a different secret and malformed token', async () => {
    const token = await createSessionToken('user_cuid_1', secret, now)

    await expect(verifySessionToken(token, `${secret}-wrong`, now)).resolves.toBeNull()
    await expect(verifySessionToken('not-a-jwt', secret, now)).resolves.toBeNull()
    await expect(verifySessionToken(undefined, secret, now)).resolves.toBeNull()
  })

  it('rejects expired tokens', async () => {
    const token = await createSessionToken('user_cuid_1', secret, now)
    const expiredAt = new Date(now.getTime() + (AUTH_SESSION_MAX_AGE_SECONDS + 1) * 1000)

    await expect(verifySessionToken(token, secret, expiredAt)).resolves.toBeNull()
  })
})
