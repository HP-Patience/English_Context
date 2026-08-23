import { describe, expect, it } from 'vitest'

import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from './session'

const secret = 'test-secret-that-is-at-least-thirty-two-characters'
const now = new Date('2026-08-23T12:00:00.000Z')

describe('signed authentication sessions', () => {
  it('accepts a valid token for the configured user', async () => {
    const token = await createSessionToken('owner', secret, now)

    await expect(verifySessionToken(token, secret, 'owner', now)).resolves.toBe(true)
  })

  it('rejects a different user or secret', async () => {
    const token = await createSessionToken('owner', secret, now)

    await expect(verifySessionToken(token, secret, 'other', now)).resolves.toBe(false)
    await expect(verifySessionToken(token, `${secret}-wrong`, 'owner', now)).resolves.toBe(false)
  })

  it('rejects expired tokens', async () => {
    const token = await createSessionToken('owner', secret, now)
    const expiredAt = new Date(now.getTime() + (AUTH_SESSION_MAX_AGE_SECONDS + 1) * 1000)

    await expect(verifySessionToken(token, secret, 'owner', expiredAt)).resolves.toBe(false)
  })
})
