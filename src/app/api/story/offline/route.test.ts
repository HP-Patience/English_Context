import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: vi.fn(),
  snapshot: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { storyCourse: {} },
  getLocalUserId: mocks.userId,
}))
vi.mock('@/lib/story-offline', () => ({ getReadyStoryOfflineSnapshot: mocks.snapshot }))

import { GET } from './route'

beforeEach(() => {
  mocks.userId.mockReset()
  mocks.userId.mockResolvedValue('user-1')
  mocks.snapshot.mockReset()
  mocks.snapshot.mockResolvedValue({ schemaVersion: 1, courseVersion: 3, lessons: [] })
})

describe('GET /api/story/offline', () => {
  it('returns 401 without an authenticated user', async () => {
    mocks.userId.mockRejectedValueOnce(new Error('Authentication required'))

    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns the versioned snapshot without allowing shared-cache storage', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('ETag')).toBe('"story-course-3"')
    await expect(response.json()).resolves.toEqual({ schemaVersion: 1, courseVersion: 3, lessons: [] })
  })

  it('returns 404 when no ready course is published', async () => {
    mocks.snapshot.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Ready story course not found' })
  })
})
