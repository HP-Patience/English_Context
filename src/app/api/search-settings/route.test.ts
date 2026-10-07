/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  getLocalUserId: vi.fn().mockResolvedValue('user-1'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: mocks.user }, getLocalUserId: mocks.getLocalUserId }))

import { GET, POST } from './route'

describe('/api/search-settings', () => {
  it('defaults to case-insensitive search', async () => {
    mocks.user.findUnique.mockResolvedValueOnce({ searchCaseInsensitive: true })
    await expect((await GET()).json()).resolves.toEqual({ searchCaseInsensitive: true })
  })

  it('persists the account search preference', async () => {
    mocks.user.update.mockResolvedValueOnce({ searchCaseInsensitive: false })
    const response = await POST(new NextRequest('http://localhost/api/search-settings', {
      method: 'POST',
      body: JSON.stringify({ searchCaseInsensitive: false }),
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ searchCaseInsensitive: false })
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { searchCaseInsensitive: false } })
  })
})
