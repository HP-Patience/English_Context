import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/config', () => ({ getAuthConfig: () => ({ secureCookie: false }) }))

import { AUTH_SESSION_COOKIE } from '@/lib/auth/session'
import { POST } from './route'

describe('POST /api/auth/logout', () => {
  it('clears the session and asks supported browsers to remove cache and storage', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost/login')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Clear-Site-Data')).toBe('"cache", "storage"')
    expect(response.cookies.get(AUTH_SESSION_COOKIE)?.value).toBe('')
  })
})
