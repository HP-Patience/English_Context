/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoryLessonListItem } from '@/lib/story-service'
import { listStoryLessons } from '@/lib/story-service'
import StoryPage from './page'

vi.mock('next/server', () => ({ connection: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {}, getLocalUserId: async () => 'user-1' }))
vi.mock('@/lib/story-service', () => ({ listStoryLessons: vi.fn() }))
vi.mock('@/components/story/StoryCourseList', () => ({
  StoryCourseList: ({ lessons }: { lessons: StoryLessonListItem[] }) => (
    <ol>{lessons.map(lesson => <li key={lesson.id}>{lesson.title}</li>)}</ol>
  ),
}))
afterEach(cleanup)

function lessons(count: number, current = 1): StoryLessonListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `lesson-${index + 1}`, order: index + 1, title: `故事 ${index + 1}`,
    sourceChapterStart: '1', sourceChapterEnd: '2', targetWordCount: 50,
    status: index + 1 < current ? 'first_passed' : 'not_started',
    completedStep: index + 1 < current ? 3 : 0,
    currentStep: index + 1 < current ? 4 : 1,
    dueReviewCount: 0, isUnlocked: true,
    completionSummary: {
      lesson: { count: 0, latestDate: null }, step: { count: 0, latestDate: null },
      paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards: 0 },
    },
  }))
}
async function show(count: number, page?: string | string[], current = 1) {
  vi.mocked(listStoryLessons).mockResolvedValue(lessons(count, current).reverse())
  render(await StoryPage({ searchParams: Promise.resolve({ page }) }))
}
describe('故事列表分页', () => {
  it('defaults to the current lesson page and keeps whole-course totals', async () => {
    await show(25, undefined, 23)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('故事 21')
    expect(screen.getByText('故事 23')).toBeInTheDocument()
    expect(screen.getByText('22 / 25')).toBeInTheDocument()
    expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
  it('shows ten ordered stories with URL-based page links targeting the list', async () => {
    await show(25, '2', 23)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('故事 11')
    expect(screen.getAllByRole('listitem')[9]).toHaveTextContent('故事 20')
    expect(screen.getByRole('link', { name: '上一页' })).toHaveAttribute('href', '/story?page=1#story-lessons-title')
    expect(screen.getByRole('link', { name: '下一页' })).toHaveAttribute('href', '/story?page=3#story-lessons-title')
  })
  it('disables previous on the first page', async () => {
    await show(11, '1')
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })
  it.each(['0', '999', 'invalid', '-1', '1.5', ['1', '2']])('handles invalid or out-of-range page %s', async page => {
    await show(25, page, 23)
    expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(10)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.getByText(page === '0' ? '第 1 / 3 页' : '第 3 / 3 页')).toBeInTheDocument()
  })
  it.each([0, 1, 10])('hides controls when there are %i stories', async count => {
    await show(count)
    expect(screen.queryByRole('navigation', { name: '故事分页' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(count)
  })
})
