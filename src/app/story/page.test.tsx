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
    render(await StoryPage())

    expect(mocks.connection).toHaveBeenCalledOnce()
    expect(mocks.getLocalUserId).toHaveBeenCalledOnce()
    expect(mocks.listStoryLessons).toHaveBeenCalledWith({
      prisma: expect.any(Object),
      userId: 'local-user',
    })
    expect(screen.getByRole('heading', { level: 1, name: '蛊界词途' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('1 篇')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '继续第 2 步' })).toHaveAttribute('href', '/story/lesson-2')
  })
})
