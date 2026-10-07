/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api-cache', () => ({ cachedFetch: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('@/components/PronounceButton', () => ({ default: () => null }))
vi.mock('@/components/SentenceTTSButton', () => ({ default: () => <button>朗读句子</button> }))
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
    for (const label of ['记得', '模糊', '忘记']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('shadow-sm', 'min-h-12', 'enabled:hover:bg-stone-200')
    }
    expect(screen.queryByRole('button', { name: /清楚/ })).not.toBeInTheDocument()
    const audio = screen.getByRole('button', { name: '朗读句子' })
    expect(audio.parentElement?.parentElement).toHaveClass('flex', 'items-start')
    expect(screen.getByRole('link', { name: 'agent' })).toHaveAttribute('href', '/word/word-1')
    expect(audio.parentElement?.nextElementSibling).toHaveTextContent('The secret agent was caught.')
    expect(audio.parentElement?.nextElementSibling).toHaveClass('min-w-0', 'flex-1', 'break-words')
    const tab = screen.getByRole('button', { name: '重新学习' })
    const initialPadding = tab.parentElement!.parentElement!.className
    fireEvent.click(tab)
    await screen.findByRole('heading', { name: hasWords ? '1 个需要重新学习' : '暂无需要重新学习的单词' })
    expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className)
      .toBe(initialPadding)
    if (hasWords) {
      fireEvent.click(screen.getByRole('button', { name: '开始学习' }))
      await screen.findByText('agent')
      expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className).toBe(initialPadding)
    }
    fireEvent.click(screen.getByRole('button', { name: '错词分析' }))
    expect(await screen.findByText('分析内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新学习' }).parentElement!.parentElement!.className).toBe(initialPadding)
    fireEvent.click(screen.getByRole('button', { name: '复习' }))
    expect(await screen.findByText('agent')).toBeInTheDocument()
  })
})

describe('ReviewPage definition actions', () => {
  it.each([1, 2])('uses matching, centered buttons and retains the forgotten grade with %i words', async count => {
    vi.mocked(cachedFetch).mockResolvedValue(Array.from({ length: count }, (_, i) => ({ ...item, id: `review-${i}` })))
    const submit = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', submit)
    try {
      render(<ReviewPage />)
      const remember = await screen.findByRole('button', { name: '记得' })
      fireEvent.click(remember)
      const forgot = screen.getByRole('button', { name: '忘记' })
      const next = screen.getByRole('button', { name: count === 1 ? '完成' : '继续' })
      expect(forgot.parentElement).toBe(next.parentElement)
      expect(next.nextElementSibling).toBe(forgot)
      expect(forgot.parentElement).toHaveClass('flex', 'justify-center', 'gap-2')
      for (const button of [forgot, next]) {
        expect(button).toHaveClass('min-h-12', 'shadow-sm', 'enabled:hover:bg-stone-200', 'w-[calc((100%_-_1rem)/3)]')
      }
      fireEvent.click(forgot)
      fireEvent.click(next)
      expect(submit).toHaveBeenCalledWith('/api/review/submit', expect.objectContaining({
        body: expect.stringContaining('"grade":0'),
      }))
    } finally { vi.unstubAllGlobals() }
  })
})

describe('failed review persistence', () => {
  it('does not animate away or advance a word when saving fails', async () => {
    vi.mocked(cachedFetch).mockResolvedValue([item, { ...item, id: 'review-2', userWord: { ...item.userWord, word: { text: 'advance', id: 'word-2' } } }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    try {
      render(<ReviewPage />)
      fireEvent.click(await screen.findByRole('button', { name: '记得' }))
      fireEvent.click(screen.getByRole('button', { name: '继续' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('进度未能保存')
      expect(screen.getByRole('heading', { name: 'agent' })).toBeInTheDocument()
      expect(screen.queryByText('advance')).not.toBeInTheDocument()
    } finally { vi.unstubAllGlobals() }
  })
})
