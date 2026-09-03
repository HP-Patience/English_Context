/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cachedFetch: vi.fn(),
  fetch: vi.fn(),
  invalidateCache: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/lib/api-cache', () => ({ cachedFetch: mocks.cachedFetch, invalidateCache: mocks.invalidateCache }))

import BookmarksPage from './page'

const bookmarks = [
  {
    type: 'storyCard',
    id: 'story-bookmark-1',
    lessonId: 'lesson-7',
    lessonOrder: 7,
    lessonTitle: '命运的回声',
    paragraphIndex: 2,
    sceneTitle: '山门之前',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    type: 'word',
    id: 'word-bookmark-1',
    userId: 'local-user',
    wordId: 'word-1',
    status: 'learning',
    mastery: 40,
    bookmarked: true,
    learnRound: 1,
    lastRatedAt: '2026-08-31T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    word: {
      id: 'word-1',
      text: 'resolve',
      meanings: [{
        id: 'meaning-1',
        partOfSpeech: 'verb',
        definition: 'decide firmly',
        definitionCn: '下定决心',
        userWordMeanings: [],
      }],
    },
  },
] as const

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cachedFetch.mockResolvedValue({ bookmarks })
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ bookmarked: false }), { status: 200 }))
  vi.stubGlobal('fetch', mocks.fetch)
})

describe('/bookmarks', () => {
  it('renders mixed bookmarks in server order with their detail destinations', async () => {
    render(<BookmarksPage />)

    const articles = await screen.findAllByRole('article')

    expect(articles).toHaveLength(2)
    expect(within(articles[0]).getByRole('link', { name: '山门之前' })).toHaveAttribute(
      'href',
      '/story/lesson-7/cards/2',
    )
    expect(within(articles[1]).getByRole('link', { name: 'resolve' })).toHaveAttribute('href', '/word/word-1')
  })

  it('sends a typed word payload and removes only that bookmark', async () => {
    const user = userEvent.setup()
    render(<BookmarksPage />)
    await screen.findByRole('link', { name: 'resolve' })

    const button = screen.getByRole('button', { name: '取消收藏单词 resolve' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await user.click(button)

    expect(mocks.fetch).toHaveBeenCalledWith('/api/bookmarks/toggle', expect.objectContaining({
      body: JSON.stringify({ type: 'word', wordId: 'word-1', bookmarked: false }),
    }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'resolve' })).not.toBeInTheDocument())
    expect(mocks.invalidateCache).toHaveBeenCalledWith('/api/bookmarks')
    expect(screen.getByRole('link', { name: '山门之前' })).toBeInTheDocument()
  })

  it('sends a typed story-card payload and removes only that bookmark', async () => {
    const user = userEvent.setup()
    render(<BookmarksPage />)
    await screen.findByRole('link', { name: '山门之前' })

    await user.click(screen.getByRole('button', { name: '取消收藏故事段落 山门之前' }))

    expect(mocks.fetch).toHaveBeenCalledWith('/api/bookmarks/toggle', expect.objectContaining({
      body: JSON.stringify({ type: 'storyCard', lessonId: 'lesson-7', paragraphIndex: 2, bookmarked: false }),
    }))
    await waitFor(() => expect(screen.queryByRole('link', { name: '山门之前' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'resolve' })).toBeInTheDocument()
  })

  it('keeps each overlapping unbookmark action in its own saving state', async () => {
    const user = userEvent.setup()
    const responses: Array<(response: Response) => void> = []
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => responses.push(resolve)))
    render(<BookmarksPage />)
    await screen.findByRole('link', { name: 'resolve' })

    await user.click(screen.getByRole('button', { name: '取消收藏故事段落 山门之前' }))
    await user.click(screen.getByRole('button', { name: '取消收藏单词 resolve' }))
    expect(screen.getAllByRole('button', { name: /取消收藏/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /取消收藏/ }).every((button) => button.hasAttribute('disabled'))).toBe(true)

    responses[0]?.(new Response(JSON.stringify({ bookmarked: false }), { status: 200 }))

    await waitFor(() => expect(screen.queryByRole('link', { name: '山门之前' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '取消收藏单词 resolve' })).toBeDisabled()
    responses[1]?.(new Response(JSON.stringify({ bookmarked: false }), { status: 200 }))
  })
})
