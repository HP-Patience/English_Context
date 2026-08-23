import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist'

type ActivateEvent = {
  waitUntil(promise: Promise<unknown>): void
}

interface AppWorkerGlobalScope extends SerwistGlobalConfig {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  addEventListener(type: 'activate', listener: (event: ActivateEvent) => void): void
}

declare const self: AppWorkerGlobalScope

const safePrecacheEntries = self.__SW_MANIFEST?.filter((entry) => {
  const value = typeof entry === 'string' ? entry : entry.url
  const pathname = value.startsWith('http://') || value.startsWith('https://')
    ? new URL(value).pathname
    : value.split(/[?#]/, 1)[0]
  return pathname.startsWith('/_next/static/')
    || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/.test(pathname)
    || pathname === '/manifest.json'
})

const sensitiveCacheNames = new Set([
  'api-cache',
  'apis',
  'next-data',
  'others',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
  'static-data-assets',
])

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => sensitiveCacheNames.has(name))
        .map((name) => caches.delete(name)),
    )),
  )
})

const serwist = new Serwist({
  precacheEntries: safePrecacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin
        && (request.mode === 'navigate' || request.headers.get('RSC') === '1'),
      handler: new NetworkOnly(),
    },
    {
      matcher: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i,
      handler: new CacheFirst({
        cacheName: 'static-assets',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      matcher: /.*/i,
      handler: new NetworkOnly(),
    },
  ],
})

serwist.addEventListeners()
