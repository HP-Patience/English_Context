import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/config', () => ({ getAuthConfig: () => ({ secureCookie: false }) }))

import { AUTH_SESSION_COOKIE } from '@/lib/auth/session'
import { POST } from './route'

describe('POST /api/auth/logout', () => {
  it('expires the session cookie and returns a no-store response without a redirect', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Clear-Site-Data')).toBeNull()
    expect(response.cookies.get(AUTH_SESSION_COOKIE)?.value).toBe('')
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
