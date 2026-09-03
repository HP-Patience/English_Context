/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invalidateCache: vi.fn() }))
vi.mock('@/lib/api-cache', () => ({ invalidateCache: mocks.invalidateCache }))

import { WordBookmarkButton } from './WordBookmarkButton'

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined
  const promise = new Promise<Response>((complete) => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('WordBookmarkButton desired-state ordering', () => {
  it('serializes rapid learning-flow bookmark then unbookmark intent', async () => {
    const first = deferredResponse()
    const second = deferredResponse()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<WordBookmarkButton wordId="word-learn" initialBookmarked={false} size="large" />)

    await user.click(screen.getByRole('button', { name: '收藏' }))
    await user.click(screen.getByRole('button', { name: '取消收藏' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    first.resolve(Response.json({ bookmarked: true }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      type: 'word', wordId: 'word-learn', bookmarked: false,
    })
    second.resolve(Response.json({ bookmarked: false }))

    expect(await screen.findByRole('button', { name: '收藏' })).toBeInTheDocument()
    expect(mocks.invalidateCache).toHaveBeenCalledTimes(2)
  })

  it('serializes rapid review-flow unbookmark then bookmark intent', async () => {
    const first = deferredResponse()
    const second = deferredResponse()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<WordBookmarkButton wordId="word-review" initialBookmarked size="base" />)

    await user.click(screen.getByRole('button', { name: '取消收藏' }))
    await user.click(screen.getByRole('button', { name: '收藏' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    first.resolve(Response.json({ bookmarked: false }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      type: 'word', wordId: 'word-review', bookmarked: true,
    })
    second.resolve(Response.json({ bookmarked: true }))

    expect(await screen.findByRole('button', { name: '取消收藏' })).toBeInTheDocument()
    expect(mocks.invalidateCache).toHaveBeenCalledTimes(2)
  })
})
