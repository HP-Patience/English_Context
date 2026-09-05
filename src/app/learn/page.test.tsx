/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams('groupId=group-1'),
}))
vi.mock('@/components/PronounceButton', () => ({ default: ({ word }: { word: string }) => <button type="button">播放 {word} 发音</button> }))
vi.mock('@/components/SentenceTTSButton', () => ({ default: () => <button type="button">朗读句子</button> }))
vi.mock('@/components/SelectionSearch', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/WordBookmarkButton', () => ({ WordBookmarkButton: () => <button type="button">收藏</button> }))

import LearnPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
    id: 'user-meaning-1',
    wordId: 'word/alter',
    word: 'alter',
    bookmarked: false,
    pos: 'verb',
    definitionCn: '改变',
    wordMastery: 0,
    meaningMastery: 0,
    sentence: 'The tailor agreed to alter the dress.',
    sentenceCn: '裁缝同意修改这件衣服。',
    groupId: 'group-1',
  }), { status: 200 }))
  vi.stubGlobal('fetch', mocks.fetch)
})

afterEach(cleanup)

describe('/learn', () => {
  it('links the active learning word to its detail page', async () => {
    render(<LearnPage />)

    expect(await screen.findByRole('link', { name: 'alter' }))
      .toHaveAttribute('href', '/word/word%2Falter')
  })
})
