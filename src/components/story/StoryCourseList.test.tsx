/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoryLessonListItem } from '../../lib/story-service'
import { StoryCourseList } from './StoryCourseList'
import { StoryCourseProgress } from './StoryCourseProgress'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ completions: [] }) }))
})

type CourseFixtureLesson = StoryLessonListItem & {
  publicationStatus?: 'ready' | 'draft' | 'failed' | 'archived'
}

function lesson(overrides: Partial<CourseFixtureLesson>): CourseFixtureLesson {
  return {
    id: 'lesson-1',
    order: 1,
    title: '青茅山醒来',
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第三章',
    targetWordCount: 72,
    status: 'not_started',
    completedStep: 0,
    currentStep: 1,
    dueReviewCount: 0,
    isUnlocked: true,
    completionSummary: {
      lesson: { count: 0, latestDate: null },
      step: { count: 0, latestDate: null },
      paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards: 2 },
    },
    publicationStatus: 'ready',
    ...overrides,
  }
}

describe('StoryCourseList', () => {
  it('renders ready lessons in course order and excludes non-ready material', () => {
    render(
      <StoryCourseList
        currentLessonId="lesson-2"
        lessons={[
          lesson({ id: 'lesson-3', order: 3, title: '花酒行者遗藏' }),
          lesson({
            id: 'lesson-failed',
            order: 0,
            title: '泄露的失败草稿',
            publicationStatus: 'failed',
          }),
          lesson({ id: 'lesson-1', order: 1, title: '青茅山醒来', status: 'first_passed', completedStep: 3, currentStep: 4 }),
          lesson({ id: 'lesson-2', order: 2, title: '学堂中的逆流', status: 'learning', completedStep: 1, currentStep: 2 }),
        ]}
      />,
    )

    expect(screen.queryByText('泄露的失败草稿')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '青茅山醒来',
      '学堂中的逆流',
      '花酒行者遗藏',
    ])
  })

  it('marks the current lesson with a distinct continuation action and lesson route', () => {
    render(
      <StoryCourseList
        currentLessonId="lesson-2"
        lessons={[
          lesson({ id: 'lesson-1', order: 1, title: '青茅山醒来', status: 'first_passed', completedStep: 3, currentStep: 4 }),
          lesson({ id: 'lesson-2', order: 2, title: '学堂中的逆流', status: 'learning', completedStep: 1, currentStep: 2, dueReviewCount: 2 }),
        ]}
      />,
    )

    const currentLesson = screen.getByRole('article', { name: '第 2 篇：学堂中的逆流' })
    expect(currentLesson).toHaveAttribute('data-current', 'true')
    expect(within(currentLesson).getByText('首次学习进行中')).toBeInTheDocument()
    expect(within(currentLesson).getByText('当前第 2 步')).toBeInTheDocument()
    expect(within(currentLesson).getByText('2 个待强化')).toBeInTheDocument()
    expect(within(currentLesson).getByRole('link', { name: '继续第 2 步' })).toHaveAttribute('href', '/story/lesson-2')
    expect(screen.getByRole('link', { name: '查看第 1 篇' })).toHaveAttribute('href', '/story/lesson-1')
  })

  it('keeps every published lesson enterable and gives each card an independent completion history', () => {
    render(
      <StoryCourseList
        currentLessonId="lesson-1"
        lessons={[
          lesson({ id: 'lesson-1', order: 1, isUnlocked: true }),
          lesson({ id: 'lesson-2', order: 2, title: '尚未解锁', isUnlocked: false }),
        ]}
      />,
    )

    expect(screen.getByRole('link', { name: '继续第 1 步' })).toHaveAttribute('href', '/story/lesson-1')
    const laterLesson = screen.getByRole('article', { name: '第 2 篇：尚未解锁' })
    expect(within(laterLesson).getByRole('link', { name: '开始第 2 篇' })).toHaveAttribute('href', '/story/lesson-2')
    expect(within(laterLesson).getByRole('region', { name: '第 2 篇完成日期历史' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '第 1 篇：青茅山醒来' }))
      .getByRole('button', { name: '查看第 1 篇完成日期历史' })).toBeInTheDocument()
  })

  it('mounts 100 lesson summaries without requesting history until one is expanded', async () => {
    const fetchMock = vi.mocked(fetch)
    const lessons = Array.from({ length: 100 }, (_, index) => lesson({
      id: `lesson-${index + 1}`,
      order: index + 1,
      title: `篇章 ${index + 1}`,
      completionSummary: {
        lesson: { count: 2, latestDate: '2026-08-18' },
        step: { count: 0, latestDate: null },
        paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards: 2 },
      },
    }))
    render(<StoryCourseList currentLessonId={null} lessons={lessons} />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(within(screen.getByRole('region', { name: '第 100 篇完成日期历史' })).getByText(/已记录/))
      .toHaveTextContent('已记录 2 次 · 最近 2026-08-18')

    await userEvent.click(screen.getByRole('button', { name: '查看第 1 篇完成日期历史' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/story/lessons/lesson-1/completions')
    expect(screen.getByLabelText('第 1 篇完成日期')).toHaveValue('')
  })

  it('shows an accessible empty state when no ready course is published', () => {
    render(<StoryCourseList currentLessonId={null} lessons={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('故事课程尚未发布')
  })
})

describe('StoryCourseProgress', () => {
  it('summarizes first-pass and reinforcement progress without making Step4 blocking', () => {
    render(
      <StoryCourseProgress
        total={80}
        firstPassed={18}
        reinforcing={7}
        reinforced={4}
        dueCount={12}
      />,
    )

    expect(screen.getByText('18 / 80')).toBeInTheDocument()
    expect(screen.getByText('7 篇')).toBeInTheDocument()
    expect(screen.getByText('4 篇')).toBeInTheDocument()
    expect(screen.getByText('12 词')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '首次学习进度' })).toHaveAttribute('aria-valuenow', '18')
    expect(screen.getByText(/Step4 会在之后按到期时间强化/)).toHaveTextContent('不会阻塞下一篇')

    for (const label of ['Course ledger', '强化中', '已强化', '今日待复习']) {
      expect(screen.getByText(label)).toHaveClass('text-stone-400')
      expect(screen.getByText(label)).not.toHaveClass('text-stone-500')
    }
  })

  it('uses plain status semantics instead of a degenerate progressbar when no lessons exist', () => {
    render(
      <StoryCourseProgress
        total={0}
        firstPassed={0}
        reinforcing={0}
        reinforced={0}
        dueCount={0}
      />,
    )

    expect(screen.getByText('0 / 0')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '首次学习进度' })).toHaveTextContent('尚无已就绪篇章')
  })
})
