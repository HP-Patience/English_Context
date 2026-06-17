type CacheEntry = {
  data: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function cachedFetch<T = unknown>(
  url: string,
  ttlMs = 30_000,
): Promise<T> {
  const cached = cache.get(url)
  if (cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.data as T)
  }

  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`cachedFetch ${url}: ${res.status}`)
    return res.json().then((data) => {
      cache.set(url, { data, expiresAt: Date.now() + ttlMs })
      return data as T
    })
  })
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
