/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invalidateCache: vi.fn() }))

vi.mock('@/lib/api-cache', () => ({ invalidateCache: mocks.invalidateCache }))

import { StoryCardBookmarkButton } from './StoryCardBookmarkButton'

const outlinedStarPath = 'm908.1 353.1l-253.9-36.9L540.7 86.1c-3.1-6.3-8.2-11.4-14.5-14.5c-15.8-7.8-35-1.3-42.9 14.5L369.8 316.2l-253.9 36.9c-7 1-13.4 4.3-18.3 9.3a32.05 32.05 0 0 0 .6 45.3l183.7 179.1l-43.4 252.9a31.95 31.95 0 0 0 46.4 33.7L512 754l227.1 119.4c6.2 3.3 13.4 4.4 20.3 3.2c17.4-3 29.1-19.5 26.1-36.9l-43.4-252.9l183.7-179.1c5-4.9 8.3-11.3 9.3-18.3c2.7-17.5-9.5-33.7-27-36.3M664.8 561.6l36.1 210.3L512 672.7L323.1 772l36.1-210.3l-152.8-149L417.6 382L512 190.7L606.4 382l211.2 30.7z'
const filledStarPath = 'm908.1 353.1l-253.9-36.9L540.7 86.1c-3.1-6.3-8.2-11.4-14.5-14.5c-15.8-7.8-35-1.3-42.9 14.5L369.8 316.2l-253.9 36.9c-7 1-13.4 4.3-18.3 9.3a32.05 32.05 0 0 0 .6 45.3l183.7 179.1l-43.4 252.9a31.95 31.95 0 0 0 46.4 33.7L512 754l227.1 119.4c6.2 3.3 13.4 4.4 20.3 3.2c17.4-3 29.1-19.5 26.1-36.9l-43.4-252.9l183.7-179.1c5-4.9 8.3-11.3 9.3-18.3c2.7-17.5-9.5-33.7-27-36.3'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StoryCardBookmarkButton', () => {
  it('renders the outlined star as an icon-only unselected control', () => {
    render(
      <StoryCardBookmarkButton
        lessonId="lesson-1"
        paragraphIndex={0}
        bookmarked={false}
        onBookmarkedChange={() => undefined}
      />,
    )

    const button = screen.getByRole('button', { name: '收藏第 1 段' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAttribute('title', '收藏第 1 段')
    expect(button).not.toHaveTextContent(/收藏|保存/)
    expect(button.querySelector('svg')).toHaveAttribute('viewBox', '0 0 1024 1024')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button.querySelector('path')).toHaveAttribute('d', outlinedStarPath)
    expect(button.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })

  it('renders the filled star as an icon-only selected control', () => {
    render(
      <StoryCardBookmarkButton
        lessonId="lesson-1"
        paragraphIndex={0}
        bookmarked
        onBookmarkedChange={() => undefined}
      />,
    )

    const button = screen.getByRole('button', { name: '取消收藏第 1 段' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAttribute('title', '取消收藏第 1 段')
    expect(button).not.toHaveTextContent(/收藏|保存/)
    expect(button.querySelector('path')).toHaveAttribute('d', filledStarPath)
  })

  it('announces saving without replacing the star geometry', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })))
    render(
      <StoryCardBookmarkButton
        lessonId="lesson-1"
        paragraphIndex={0}
        bookmarked={false}
        onBookmarkedChange={() => undefined}
      />,
    )

    const button = screen.getByRole('button', { name: '收藏第 1 段' })
    const initialPath = button.querySelector('path')?.getAttribute('d')
    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('path')).toHaveAttribute('d', initialPath)
    resolveRequest?.(Response.json({ type: 'storyCard', bookmarked: true }))
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
  })

  it('invalidates bookmark list cache after the desired state is confirmed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ type: 'storyCard', bookmarked: true }))
    const onBookmarkedChange = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <StoryCardBookmarkButton
        lessonId="lesson-1"
        paragraphIndex={0}
        bookmarked={false}
        onBookmarkedChange={onBookmarkedChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '收藏第 1 段' }))

    await waitFor(() => expect(onBookmarkedChange).toHaveBeenCalledWith(true))
    expect(mocks.invalidateCache).toHaveBeenCalledWith('/api/bookmarks')
  })
})
