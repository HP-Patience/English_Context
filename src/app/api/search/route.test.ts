/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  getLocalUserId: vi.fn().mockResolvedValue('user-1'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique }, word: { findMany: mocks.findMany } },
  getLocalUserId: mocks.getLocalUserId,
}))

import { GET } from './route'

describe('/api/search', () => {
  it('uses case-insensitive matching by default', async () => {
    mocks.findUnique.mockResolvedValueOnce({ searchCaseInsensitive: true })
    mocks.findMany.mockResolvedValueOnce([{ meanings: [{}] }])
    await GET(new NextRequest('http://localhost/api/search?q=Capital'))
    const where = mocks.findMany.mock.calls[0][0].where
    expect(where.OR[0].text).toMatchObject({ startsWith: 'Capital', mode: 'insensitive' })
    expect(where.OR[1].text).toMatchObject({ contains: 'Capital', mode: 'insensitive' })
  })

  it('can preserve case-sensitive matching when disabled', async () => {
    mocks.findUnique.mockResolvedValueOnce({ searchCaseInsensitive: false })
    mocks.findMany.mockResolvedValueOnce([{ meanings: [{}] }])
    await GET(new NextRequest('http://localhost/api/search?q=Capital'))
    const where = mocks.findMany.mock.calls[1][0].where
    expect(where.OR[0].text).toEqual({ startsWith: 'Capital' })
    expect(where.OR[1].text).toEqual({ contains: 'Capital' })
  })
})
