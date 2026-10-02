import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'
import { POST as login } from './route'
import { hashPassword } from '@/lib/auth/password'
import { clearLoginFailures } from '@/lib/auth/rate-limit'
import { AUTH_SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

const secret = 'route-test-secret-that-is-at-least-thirty-two-characters'
let passwordHash: string
const findUnique = vi.mocked(prisma.user.findUnique)

function loginRequest(username: string, password: string) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

describe('login route', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword('correct-private-password', Buffer.alloc(16, 9))
  })

  beforeEach(() => {
    clearLoginFailures()
    findUnique.mockReset()
    vi.stubEnv('APP_AUTH_SECRET', secret)
    vi.stubEnv('APP_AUTH_SECURE_COOKIE', 'false')
    findUnique.mockResolvedValue({
      id: 'user-owner', passwordHash, status: 'active',
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a signed HttpOnly session for valid credentials', async () => {
    const response = await login(loginRequest('owner', 'correct-private-password'))

    expect(response.status).toBe(200)
    const cookie = response.cookies.get(AUTH_SESSION_COOKIE)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('lax')
    expect(cookie?.secure).toBe(false)
    await expect(verifySessionToken(cookie?.value, secret)).resolves.toBe('user-owner')
  })

  it('rejects invalid credentials without identifying which field failed', async () => {
    const response = await login(loginRequest('owner', 'wrong-password'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: '用户名或密码错误' })
    expect(response.cookies.get(AUTH_SESSION_COOKIE)).toBeUndefined()
  })

  it('rejects disabled users with the same generic error', async () => {
    findUnique.mockResolvedValue({
      id: 'user-owner', passwordHash, status: 'disabled',
    } as never)

    const response = await login(loginRequest('owner', 'correct-private-password'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: '用户名或密码错误' })
  })

  it('fails closed when the signing secret is not configured', async () => {
    vi.stubEnv('APP_AUTH_SECRET', '')

    const response = await login(loginRequest('owner', 'correct-private-password'))
    expect(response.status).toBe(503)
  })
})
