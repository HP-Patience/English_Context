import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { AUTH_SESSION_COOKIE, createSessionToken } from '@/lib/auth/session'
import { proxy } from './proxy'

const secret = 'proxy-test-secret-that-is-at-least-thirty-two-characters'

function request(path: string, token?: string) {
  const headers = token
    ? { cookie: `${AUTH_SESSION_COOKIE}=${token}` }
    : undefined
  return new NextRequest(`http://localhost${path}`, { headers })
}

describe('authentication proxy', () => {
  beforeEach(() => {
    vi.stubEnv('APP_AUTH_USERNAME', 'owner')
    vi.stubEnv('APP_AUTH_PASSWORD_HASH', 'configured-hash')
    vi.stubEnv('APP_AUTH_SECRET', secret)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects unauthenticated pages to login with a return path', async () => {
    const response = await proxy(request('/story?lesson=2'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/story?lesson=2')
  })

  it('returns JSON 401 for unauthenticated API requests', async () => {
    const response = await proxy(request('/api/story/lessons'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' })
  })

  it('allows a valid signed session', async () => {
    const token = await createSessionToken('owner', secret)
    const response = await proxy(request('/story', token))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('keeps login public and redirects an authenticated user away from it', async () => {
    const publicResponse = await proxy(request('/login'))
    expect(publicResponse.status).toBe(200)

    const token = await createSessionToken('owner', secret)
    const authenticatedResponse = await proxy(request('/login', token))
    expect(authenticatedResponse.status).toBe(307)
    expect(new URL(authenticatedResponse.headers.get('location')!).pathname).toBe('/')
  })

  it('fails closed when authentication is not configured', async () => {
    vi.stubEnv('APP_AUTH_SECRET', '')

    const pageResponse = await proxy(request('/story'))
    expect(new URL(pageResponse.headers.get('location')!).searchParams.get('error')).toBe('configuration')

    const apiResponse = await proxy(request('/api/story/lessons'))
    expect(apiResponse.status).toBe(503)
  })
})
