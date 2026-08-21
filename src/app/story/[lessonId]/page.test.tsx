/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getLocalUserId: vi.fn().mockResolvedValue('local-user'),
  getStoryLesson: vi.fn(),
  listStoryLessons: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/server', () => ({ connection: mocks.connection }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/prisma', () => ({ prisma: { storyLesson: {} }, getLocalUserId: mocks.getLocalUserId }))
vi.mock('@/lib/story-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/story-service')>()
  return { ...original, getStoryLesson: mocks.getStoryLesson, listStoryLessons: mocks.listStoryLessons }
})

import StoryLessonPage from './page'

const readyLesson = {
  id: 'lesson-1',
  order: 1,
  title: '青茅山醒来',
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第三章',
  content: {
    title: '青茅山醒来',
    order: 1,
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第三章',
    sourceSummary: '安全摘要',
    continuityNotes: '安全衔接',
    paragraphs: [{ sceneTitle: '雨夜重生', segments: [{ type: 'text', value: '安全改写。' }] }],
  },
  lessonWords: [],
  progress: {
    userId: 'local-user', lessonId: 'lesson-1', status: 'not_started', currentStep: 1, completedStep: 0,
    step1CompletedAt: null, step2CompletedAt: null, step3CompletedAt: null, completedAt: null,
  },
  dueReviewCount: 0,
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.connection.mockResolvedValue(undefined)
  mocks.getLocalUserId.mockResolvedValue('local-user')
  mocks.getStoryLesson.mockResolvedValue(readyLesson)
  mocks.listStoryLessons.mockResolvedValue([
    { id: 'lesson-1', order: 1, completedStep: 0 },
    { id: 'lesson-2', order: 2, completedStep: 0 },
  ])
})

describe('/story/[lessonId] server page', () => {
  it('awaits dynamic params and loads the lesson only through ready-course services', async () => {
    render(await StoryLessonPage({ params: Promise.resolve({ lessonId: 'lesson-1' }) }))

    expect(mocks.connection).toHaveBeenCalledOnce()
    expect(mocks.getLocalUserId).toHaveBeenCalledOnce()
    expect(mocks.getStoryLesson).toHaveBeenCalledWith({
      prisma: expect.any(Object), userId: 'local-user', lessonId: 'lesson-1',
    })
    expect(mocks.listStoryLessons).toHaveBeenCalledWith({ prisma: expect.any(Object), userId: 'local-user' })
    expect(screen.getByRole('heading', { level: 1, name: '青茅山醒来' })).toBeInTheDocument()
  })

  it('rejects malformed dynamic params before querying lesson data', async () => {
    await expect(StoryLessonPage({ params: Promise.resolve({ lessonId: '   ' }) })).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.notFound).toHaveBeenCalledOnce()
    expect(mocks.getStoryLesson).not.toHaveBeenCalled()
    expect(mocks.listStoryLessons).not.toHaveBeenCalled()
  })
  it('uses the safe not-found boundary for invalid, missing, draft, or unpublished lesson ids', async () => {
    mocks.getStoryLesson.mockResolvedValueOnce(null)

    await expect(StoryLessonPage({ params: Promise.resolve({ lessonId: 'draft-lesson' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalledOnce()
  })
})
