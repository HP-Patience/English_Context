import { describe, expect, it } from 'vitest'

import {
  STORY_OFFLINE_READY_KEY,
  STORY_OFFLINE_SHELL_URL,
  STORY_OFFLINE_SNAPSHOT_KEY,
  getStoryOfflineStatus,
  prepareStoryOffline,
  purgeStoryOfflineCache,
  withStoryOfflineLock,
  type StoryOfflineLockManager,
} from './story-offline-cache'

class MemoryCache {
  readonly entries = new Map<string, Response>()

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(String(request))?.clone()
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(String(request), response.clone())
  }
}

class MemoryCacheStorage {
  readonly stores = new Map<string, MemoryCache>()

  async open(name: string): Promise<MemoryCache> {
    const existing = this.stores.get(name)
    if (existing) return existing
    const cache = new MemoryCache()
    this.stores.set(name, cache)
    return cache
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()]
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name)
  }
}

class MemoryLockManager implements StoryOfflineLockManager {
  private tail: Promise<void> = Promise.resolve()

  request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
    const result = this.tail.then(callback)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function snapshotResponse(courseVersion: number): Response {
  return Response.json({ schemaVersion: 1, courseVersion, lessons: [] }, {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('story offline cache preparation', () => {
  it('publishes a complete new version before deleting a stale ready version', async () => {
    const cacheStorage = new MemoryCacheStorage()
    const oldCache = await cacheStorage.open('story-offline-course-v1')
    await oldCache.put(STORY_OFFLINE_SNAPSHOT_KEY, snapshotResponse(1))
    await oldCache.put(STORY_OFFLINE_SHELL_URL, new Response('<html>old</html>'))
    await oldCache.put(STORY_OFFLINE_READY_KEY, new Response('1'))

    const result = await prepareStoryOffline({
      cacheStorage,
      fetcher: async (request) => String(request) === STORY_OFFLINE_SHELL_URL
        ? new Response('<html>new</html>', { status: 200 })
        : snapshotResponse(2),
    })

    expect(result).toEqual({ kind: 'ready', courseVersion: 2, lessonCount: 0 })
    expect(await cacheStorage.keys()).toEqual(['story-offline-course-v2'])
    const newCache = await cacheStorage.open('story-offline-course-v2')
    await expect(newCache.match(STORY_OFFLINE_SNAPSHOT_KEY)).resolves.toBeInstanceOf(Response)
    await expect(newCache.match(STORY_OFFLINE_SHELL_URL)).resolves.toBeInstanceOf(Response)
    await expect(newCache.match(STORY_OFFLINE_READY_KEY)).resolves.toBeInstanceOf(Response)
    await expect(getStoryOfflineStatus(cacheStorage)).resolves.toEqual({
      kind: 'ready',
      courseVersion: 2,
      lessonCount: 0,
    })
  })

  it('keeps the previous version ready when the new shell cannot be fetched', async () => {
    const cacheStorage = new MemoryCacheStorage()
    const oldCache = await cacheStorage.open('story-offline-course-v1')
    await oldCache.put(STORY_OFFLINE_SNAPSHOT_KEY, snapshotResponse(1))
    await oldCache.put(STORY_OFFLINE_SHELL_URL, new Response('<html>old</html>'))
    await oldCache.put(STORY_OFFLINE_READY_KEY, new Response('1'))

    await expect(prepareStoryOffline({
      cacheStorage,
      fetcher: async (request) => String(request) === STORY_OFFLINE_SHELL_URL
        ? new Response('unavailable', { status: 503 })
        : snapshotResponse(2),
    })).rejects.toThrow(/offline shell/i)

    expect(await cacheStorage.keys()).toEqual(['story-offline-course-v1'])
    await expect(getStoryOfflineStatus(cacheStorage)).resolves.toEqual({
      kind: 'ready',
      courseVersion: 1,
      lessonCount: 0,
    })
  })

  it('purges every story snapshot and readiness cache while preserving unrelated caches', async () => {
    const cacheStorage = new MemoryCacheStorage()
    await cacheStorage.open('story-offline-course-v1')
    await cacheStorage.open('story-offline-course-v2')
    await cacheStorage.open('app-shell-v1')

    await purgeStoryOfflineCache(cacheStorage)

    expect(await cacheStorage.keys()).toEqual(['app-shell-v1'])
  })

  it('blocks logout until preparation completes and then purges the prepared cache', async () => {
    const cacheStorage = new MemoryCacheStorage()
    const lockManager = new MemoryLockManager()
    const shell = deferred<Response>()
    const shellStarted = deferred<void>()
    const preparation = prepareStoryOffline({
      cacheStorage,
      lockManager,
      fetcher: async (request) => {
        if (String(request) !== STORY_OFFLINE_SHELL_URL) return snapshotResponse(2)
        shellStarted.resolve()
        return shell.promise
      },
    })
    await shellStarted.promise
    let logoutPosted = false

    const logout = withStoryOfflineLock(async () => {
      await purgeStoryOfflineCache(cacheStorage)
      logoutPosted = true
    }, lockManager)

    expect(logoutPosted).toBe(false)
    shell.resolve(new Response('<html>new</html>', { status: 200 }))
    await preparation
    await logout

    expect(logoutPosted).toBe(true)
    expect(await cacheStorage.keys()).toEqual([])
  })

  it('rejects preparation queued after cookie clearing without leaving a story cache', async () => {
    const cacheStorage = new MemoryCacheStorage()
    await cacheStorage.open('story-offline-course-v1')
    const lockManager = new MemoryLockManager()
    const releaseLogout = deferred<void>()
    const cookieCleared = deferred<void>()
    let sessionActive = true
    const logout = withStoryOfflineLock(async () => {
      await purgeStoryOfflineCache(cacheStorage)
      sessionActive = false
      cookieCleared.resolve()
      await releaseLogout.promise
    }, lockManager)
    await cookieCleared.promise

    const preparation = prepareStoryOffline({
      cacheStorage,
      lockManager,
      fetcher: async () => sessionActive
        ? snapshotResponse(2)
        : new Response('unauthorized', { status: 401 }),
    })
    releaseLogout.resolve()
    await logout

    await expect(preparation).rejects.toThrow(/snapshot request failed \(401\)/)
    expect(await cacheStorage.keys()).toEqual([])
  })

  it('uses an explicit best-effort fallback when Web Locks are unavailable', async () => {
    let ran = false

    await withStoryOfflineLock(async () => { ran = true }, undefined)

    expect(ran).toBe(true)
  })
})
