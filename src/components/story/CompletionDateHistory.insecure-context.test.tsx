/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CompletionDateHistory } from './CompletionDateHistory'

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CompletionDateHistory on plain HTTP', () => {
  it('records a date when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ completions: [] }) })
      .mockImplementationOnce(async (_endpoint: string, init: RequestInit) => {
        const payload = JSON.parse(String(init.body)) as { completionId: string; date: string }
        return {
          ok: true,
          json: async () => ({
            completion: { id: 'event-1', ...payload, createdAt: '2026-09-05T00:00:00.000Z' },
          }),
        }
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<CompletionDateHistory endpoint="/api/story/lessons/lesson-1/completions" label="篇章完成日期" />)
    fireEvent.click(await screen.findByRole('button', { name: '记录今天' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const payload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { completionId: string }
    expect(payload.completionId).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
