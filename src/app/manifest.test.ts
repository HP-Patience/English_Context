import { describe, expect, it } from 'vitest'

import manifest from './manifest'

describe('PWA manifest', () => {
  it('publishes regular and maskable icons at installable sizes', () => {
    const value = manifest()

    expect(value.start_url).toBe('/story')
    expect(value.display).toBe('standalone')
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' }),
      expect.objectContaining({ src: '/icon-192-maskable.png', sizes: '192x192', purpose: 'maskable' }),
      expect.objectContaining({ src: '/icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' }),
    ]))
  })
})
