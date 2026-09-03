import { afterEach, describe, expect, it, vi } from 'vitest'

import { cachedFetch, clearCache, invalidateCache } from './api-cache'

afterEach(() => {
  clearCache()
  vi.unstubAllGlobals()
})

describe('api cache invalidation', () => {
  it('fetches fresh bookmark data after bookmark entries are invalidated', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ bookmarks: ['stale'] }))
      .mockResolvedValueOnce(Response.json({ bookmarks: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(cachedFetch('/api/bookmarks')).resolves.toEqual({ bookmarks: ['stale'] })
    await expect(cachedFetch('/api/bookmarks')).resolves.toEqual({ bookmarks: ['stale'] })
    invalidateCache('/api/bookmarks')

    await expect(cachedFetch('/api/bookmarks')).resolves.toEqual({ bookmarks: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
