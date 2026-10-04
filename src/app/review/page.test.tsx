/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api-cache', () => ({ cachedFetch: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('@/components/PronounceButton', () => ({ default: () => null }))
vi.mock('@/components/SentenceTTSButton', () => ({ default: () => null }))
vi.mock('@/components/WordBookmarkButton', () => ({ WordBookmarkButton: () => null }))
vi.mock('@/components/SelectionSearch', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/AnalysisPanel', () => ({ default: () => <p>分析内容</p> }))

import { cachedFetch } from '@/lib/api-cache'
import ReviewPage from './page'

const item = {
  id: 'review-1', mastery: 40, wordMastery: 40,
  meaning: { id: 'meaning-1', partOfSpeech: 'n.', definition: 'a representative', definitionCn: '代理人' },
  userWord: { word: { text: 'agent', id: 'word-1' }, wordId: 'word-1', bookmarked: false },
  sentences: [{ sentenceText: 'The secret agent was caught.', sentenceCn: null, contextTopic: null }],
}

afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('ReviewPage tab placement', () => {
  it.each([true, false])('keeps the tab bar top-aligned when relearn has words: %s', async (hasWords) => {
    vi.mocked(cachedFetch).mockImplementation(async (url) => url === '/api/review-queue' || hasWords ? [item] : [])
    render(<ReviewPage />)
    await screen.findByText('agent')
    const tab = screen.getByRole('button', { name: '重新学习' })
    const initialPadding = tab.parentElement!.parentElement!.className
    fireEvent.click(tab)
    await screen.findByRole('heading', { name: hasWords ? '1 个需要重新学习' : '暂无需要重新学习的单词' })
    expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className)
      .toBe(initialPadding + ' text-center')
    if (hasWords) {
      fireEvent.click(screen.getByRole('button', { name: '开始学习' }))
      await screen.findByText('agent')
      expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className).toBe(initialPadding)
    }
    fireEvent.click(screen.getByRole('button', { name: '错词分析' }))
    expect(screen.getByText('分析内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className).toBe(initialPadding)
    fireEvent.click(screen.getByRole('button', { name: '复习' }))
    expect(screen.getByText('agent')).toBeInTheDocument()
  })
})
