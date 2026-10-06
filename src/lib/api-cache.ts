type CacheEntry = {
  data: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

export function cachedFetch<T = unknown>(
  url: string,
  ttlMs = 30_000,
): Promise<T> {
  const cached = cache.get(url)
  if (cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.data as T)
  }

  const pending = inFlight.get(url)
  if (pending) return pending as Promise<T>

  const request = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`cachedFetch ${url}: ${res.status}`)
      return res.json().then((data) => {
        cache.set(url, { data, expiresAt: Date.now() + ttlMs })
        return data as T
      })
    })
    .finally(() => {
      if (inFlight.get(url) === request) inFlight.delete(url)
    })

  inFlight.set(url, request)
  return request
}

/** Invalidate all cache entries whose URL contains `pattern` */
export function invalidateCache(pattern: string) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key)
  }
}

/** Clear entire cache */
export function clearCache() {
  cache.clear()
}
