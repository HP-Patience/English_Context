/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  fetch: vi.fn(),
  invalidateCache: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'word-1' }),
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))
vi.mock('@/components/PronounceButton', () => ({ default: ({ word }: { word: string }) => <button type="button">播放 {word} 发音</button> }))
vi.mock('@/components/SentenceTTSButton', () => ({ default: () => <button type="button">朗读句子</button> }))
vi.mock('@/lib/api-cache', () => ({ invalidateCache: mocks.invalidateCache }))

import WordDetailPage from './page'

const responseBody = {
  word: {
    id: 'word-1',
    text: 'resolve',
    meanings: [{
      id: 'meaning-1',
      partOfSpeech: 'verb',
      definition: 'decide firmly',
      definitionCn: '下定决心',
      userWordMeanings: [{
        id: 'user-meaning-1',
        mastery: 40,
        easeFactor: 2.5,
        interval: 3,
        nextReviewAt: '2026-09-05T00:00:00.000Z',
        sentences: [{ sentenceText: 'She resolved to continue.', sentenceCn: '她下定决心继续。', contextTopic: 'choice' }],
      }],
    }],
    userWords: [{ id: 'user-word-1', mastery: 40, status: 'learning', bookmarked: false }],
    groups: [{ wordGroup: { id: 'group-1', name: '高频词' } }],
  },
  storyReferences: [
    { lessonId: 'lesson-2', lessonOrder: 2, lessonTitle: '学堂中的逆流', paragraphIndex: 1, sceneTitle: '学堂交锋', wordOrder: 12 },
    { lessonId: 'lesson-5', lessonOrder: 5, lessonTitle: '山寨风云', paragraphIndex: 3, sceneTitle: '长老议事', wordOrder: 31 },
  ],
} as const

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetch.mockImplementation((input: string | URL | Request) => {
    const url = String(input)
    if (url === '/api/words/word-1') return Promise.resolve(new Response(JSON.stringify(responseBody), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify({ type: 'word', bookmarked: true }), { status: 200 }))
  })
  vi.stubGlobal('fetch', mocks.fetch)
})

describe('/word/[id]', () => {
  it('keeps learning content and renders every top-level story reference as a direct paragraph link', async () => {
    render(<WordDetailPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'resolve' })).toBeInTheDocument()
    expect(screen.getByText('decide firmly')).toBeInTheDocument()
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === 'She resolved to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '朗读句子' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /学堂交锋/ })).toHaveAttribute('href', '/story/lesson-2/cards/1')
    expect(screen.getByRole('link', { name: /长老议事/ })).toHaveAttribute('href', '/story/lesson-5/cards/3')
  })

  it('uses the typed word contract when toggling the word bookmark', async () => {
    const user = userEvent.setup()
    render(<WordDetailPage />)
    await screen.findByRole('heading', { level: 1, name: 'resolve' })

    await user.click(screen.getByRole('button', { name: '收藏单词 resolve' }))

    expect(mocks.fetch).toHaveBeenCalledWith('/api/bookmarks/toggle', expect.objectContaining({
      body: JSON.stringify({ type: 'word', wordId: 'word-1', bookmarked: true }),
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: '取消收藏单词 resolve' })).toHaveAttribute('aria-pressed', 'true'))
    expect(mocks.invalidateCache).toHaveBeenCalledWith('/api/bookmarks')
  })
})
