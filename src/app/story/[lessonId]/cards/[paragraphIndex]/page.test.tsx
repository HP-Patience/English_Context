/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getLocalUserId: vi.fn().mockResolvedValue('local-user'),
  getStoryLesson: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  detailProps: [] as unknown[],
}))

vi.mock('next/server', () => ({ connection: mocks.connection }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/prisma', () => ({ prisma: {}, getLocalUserId: mocks.getLocalUserId }))
vi.mock('@/lib/story-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/story-service')>()
  return { ...original, getStoryLesson: mocks.getStoryLesson }
})
vi.mock('@/components/story/StoryCardDetail', () => ({
  StoryCardDetail: (props: { paragraph: { sceneTitle: string } }) => {
    mocks.detailProps.push(props)
    return <h1>{props.paragraph.sceneTitle}</h1>
  },
}))

import StoryCardPage from './page'

const lesson = {
  id: 'lesson-1', order: 1, title: '青茅山醒来', sourceChapterStart: '第一章', sourceChapterEnd: '第三章',
  content: {
    title: '青茅山醒来', order: 1, sourceChapterStart: '第一章', sourceChapterEnd: '第三章',
    sourceSummary: '摘要', continuityNotes: '衔接',
    paragraphs: [
      { sceneTitle: '雨夜重生', segments: [{ type: 'text', value: '雨夜。' }] },
      { sceneTitle: '学堂试探', segments: [{ type: 'text', value: '学堂。' }] },
    ],
  },
  lessonWords: [], progress: {}, dueReviewCount: 0, reviewState: { words: [], attempts: [] },
  bookmarkedParagraphIndexes: [1],
  completionSummary: {
    lesson: { count: 0, latestDate: null }, step: { count: 0, latestDate: null },
    paragraph: { count: 4, latestDate: '2026-08-22', completedCards: 1, totalCards: 2 },
  },
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.detailProps.length = 0
  mocks.getStoryLesson.mockResolvedValue(lesson)
})

describe('/story/[lessonId]/cards/[paragraphIndex] server page', () => {
  it('loads the selected paragraph and mapped lesson words through the ready lesson service', async () => {
    render(await StoryCardPage({ params: Promise.resolve({ lessonId: 'lesson-1', paragraphIndex: '1' }) }))

    expect(mocks.getStoryLesson).toHaveBeenCalledWith({ prisma: expect.any(Object), userId: 'local-user', lessonId: 'lesson-1' })
    expect(screen.getByRole('heading', { level: 1, name: '学堂试探' })).toBeInTheDocument()
    expect(mocks.detailProps[0]).toMatchObject({
      lessonId: 'lesson-1',
      paragraphIndex: 1,
      paragraph: lesson.content.paragraphs[1],
      initiallyBookmarked: true,
    })
  })

  it('uses the not-found boundary for malformed or out-of-range paragraph indexes', async () => {
    await expect(StoryCardPage({ params: Promise.resolve({ lessonId: 'lesson-1', paragraphIndex: '9' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(StoryCardPage({ params: Promise.resolve({ lessonId: 'lesson-1', paragraphIndex: '-1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
