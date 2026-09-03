/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getLocalUserId: vi.fn().mockResolvedValue('local-user'),
  listStoryLessons: vi.fn().mockResolvedValue([
    {
      id: 'lesson-2',
      order: 2,
      title: '学堂中的逆流',
      sourceChapterStart: '第四章',
      sourceChapterEnd: '第七章',
      targetWordCount: 68,
      status: 'learning',
      completedStep: 1,
      currentStep: 2,
      dueReviewCount: 2,
      isUnlocked: true,
      completionSummary: {
        lesson: { count: 1, latestDate: '2026-08-22' },
        step: { count: 2, latestDate: '2026-08-22' },
        paragraph: { count: 3, latestDate: '2026-08-22', completedCards: 2, totalCards: 4 },
      },
    },
    {
      id: 'lesson-1',
      order: 1,
      title: '青茅山醒来',
      sourceChapterStart: '第一章',
      sourceChapterEnd: '第三章',
      targetWordCount: 72,
      status: 'reinforced',
      completedStep: 3,
      currentStep: 4,
      dueReviewCount: 0,
      isUnlocked: true,
      completionSummary: {
        lesson: { count: 0, latestDate: null },
        step: { count: 0, latestDate: null },
        paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards: 3 },
      },
    },
  ]),
}))

vi.mock('next/server', () => ({ connection: mocks.connection }))
vi.mock('@/lib/prisma', () => ({ prisma: { storyLesson: {} }, getLocalUserId: mocks.getLocalUserId }))
vi.mock('@/lib/story-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/story-service')>()
  return { ...original, listStoryLessons: mocks.listStoryLessons }
})
import StoryPage from './page'

describe('/story server page', () => {
  it('loads the local user course through the service and renders aggregate progress', async () => {
    const { container } = render(await StoryPage())

    expect(mocks.connection).toHaveBeenCalledOnce()
    expect(mocks.getLocalUserId).toHaveBeenCalledOnce()
    expect(mocks.listStoryLessons).toHaveBeenCalledWith({
      prisma: expect.any(Object),
      userId: 'local-user',
    })
    expect(screen.getByRole('heading', { level: 1, name: '蛊界词途' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '修习卷宗' })).toBeInTheDocument()
    expect(screen.getByText('1 篇')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续第 2 步' })).toHaveAttribute('href', '/story/lesson-2')
    expect(container.firstElementChild).toHaveClass('story-theme')
  })
})
