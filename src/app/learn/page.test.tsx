/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }))
vi.mock('@/components/PronounceButton', () => ({ default: () => <button>发音</button> }))
vi.mock('@/components/SentenceTTSButton', () => ({ default: () => <button>朗读句子</button> }))
vi.mock('@/components/WordBookmarkButton', () => ({ WordBookmarkButton: () => <button>收藏单词</button> }))
vi.mock('@/components/SelectionSearch', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
import LearnPage from './page'

const item = { id: null, meaningId: 'meaning-1', wordId: 'word-1', word: 'agent', bookmarked: false, pos: 'noun', definition: 'a representative', definitionCn: '代理人', sentence: 'The secret agent was caught.', sentenceCn: '秘密特工被抓住了。' }
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.query = '' })
describe('direct word learning', () => {
  it('keeps loading within the selected group and resets state when the group changes', async () => {
    mocks.query = 'groupId=group%2F2'
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ done: true })).mockResolvedValueOnce(reply(item)).mockResolvedValueOnce(reply({ newMastery: 63 })).mockResolvedValueOnce(reply({ ...item, word: 'advance', meaningId: 'meaning-2' }))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<LearnPage />)
    await screen.findByRole('heading', { name: '暂时没有未背的单词' })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/kaoyan/learn?groupId=group%2F2', { cache: 'no-store' })
    mocks.query = 'groupId=group-3'
    rerender(<LearnPage />)
    await screen.findByRole('link', { name: 'agent' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/kaoyan/learn?groupId=group-3', { cache: 'no-store' })
    fireEvent.click(screen.getByRole('button', { name: '清楚' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await screen.findByRole('link', { name: 'advance' })
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/kaoyan/learn?groupId=group-3', { cache: 'no-store' })
  })
  it('loads the next unread word without choosing a group, then saves the selected rating before advancing', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(item)).mockResolvedValueOnce(reply({ newMastery: 63 })).mockResolvedValueOnce(reply({ ...item, meaningId: 'meaning-2', wordId: 'word-2', word: 'advance' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LearnPage />)
    expect(await screen.findByRole('link', { name: 'agent' })).toHaveAttribute('href', '/word/word-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/kaoyan/learn', { cache: 'no-store' })
    expect(screen.queryByText('代理人')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清楚' }))
    expect(screen.getByText('代理人')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    expect(await screen.findByRole('link', { name: 'advance' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/kaoyan/learn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meaningId: 'meaning-1', grade: 4 }) })
  })
  it('rates the exact existing progress record rather than initializing another meaning', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ ...item, id: 'pending-1' })).mockResolvedValueOnce(reply({ newMastery: 58 })).mockResolvedValueOnce(reply({ done: true }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LearnPage />)
    await screen.findByRole('link', { name: 'agent' })
    fireEvent.click(screen.getByRole('button', { name: '模糊' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await screen.findByRole('heading', { name: '暂时没有未背的单词' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/kaoyan/learn', expect.objectContaining({ body: JSON.stringify({ userWordMeaningId: 'pending-1', grade: 2 }) }))
  })
  it('keeps the same word and selected rating when saving fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(item)).mockResolvedValueOnce(reply({ error: 'failed' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    render(<LearnPage />)
    await screen.findByRole('link', { name: 'agent' })
    fireEvent.click(screen.getByRole('button', { name: '忘记' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('进度未能保存')
    expect(screen.getByRole('link', { name: 'agent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '忘记' })).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('shows an explicit empty state instead of a blank page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ done: true })))
    render(<LearnPage />)
    expect(await screen.findByRole('heading', { name: '暂时没有未背的单词' })).toBeInTheDocument()
  })
  it('offers a retry after loading fails rather than claiming learning is complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({}, 500)).mockResolvedValueOnce(reply(item)))
    render(<LearnPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('单词加载失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('link', { name: 'agent' })).toBeInTheDocument()
  })
})
