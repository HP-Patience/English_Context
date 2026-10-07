/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api-cache', () => ({ cachedFetch: vi.fn() }))
import { cachedFetch } from '@/lib/api-cache'
import HomePage from './page'
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('HomePage word lists', () => {
  it('opens learning for the selected list while keeping the separate list-view destination', async () => {
    vi.mocked(cachedFetch).mockResolvedValue({ totalWords: 175, learnedCount: 11, dueCount: 0, groups: [
      { id: 'group-1', name: '高频词 Word List 1', total: 85, learned: 11, currentRound: 0 },
      { id: 'group-2', name: '高频词 Word List 2', total: 90, learned: 0, currentRound: 0 },
    ] })
    render(<HomePage />)
    const stage = await screen.findByRole('button', { name: /高频词/ })
    const review = screen.getByRole('link', { name: '复习' })
    expect(review).toHaveAttribute('href', '/review')
    expect(review).toHaveClass('inline-flex', 'items-center', 'justify-center', 'shadow-sm', 'hover:bg-stone-200')
    expect(review.className).not.toContain('enabled:hover:')
    expect(screen.queryByRole('region', { name: '连续故事背词' })).not.toBeInTheDocument()
    expect(screen.queryByText('进入故事课程')).not.toBeInTheDocument()
    fireEvent.click(stage)
    const learn = screen.getByRole('link', { name: /高频词 Word List 2/ })
    expect(learn).toHaveAttribute('href', '/learn?groupId=group-2')
    expect(within(learn.parentElement!).getByRole('link', { name: '列表' })).toHaveAttribute('href', '/list/group-2')
    expect(screen.getByRole('link', { name: /高频词 Word List 1/ })).toHaveAttribute('href', '/learn?groupId=group-1')
    fireEvent.click(stage)
    expect(screen.queryByRole('link', { name: /高频词 Word List 2/ })).not.toBeInTheDocument()
  })
})
