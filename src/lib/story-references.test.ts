import { describe, expect, it, vi } from 'vitest'

import { parseBookmarkStatePayload } from './bookmark-api-types'
import { listReadyStoryReferences } from './story-references'
import { setStoryCardBookmark } from './story-bookmarks'

function content(title: string, order: number, targetOrder: number): string {
  return JSON.stringify({
    title,
    order,
    sourceChapterStart: 'one',
    sourceChapterEnd: 'two',
    sourceSummary: 'summary',
    continuityNotes: 'notes',
    paragraphs: [
      { sceneTitle: 'before', segments: [{ type: 'text', value: 'before' }] },
      {
        sceneTitle: `scene-${order}`,
        segments: [{ type: 'targetWord', word: 'alpha', definitionCn: 'alpha', phonetic: '/a/', wordOrder: targetOrder }],
      },
    ],
  })
}

describe('bookmark payloads', () => {
  it('parses desired bookmark state for word and story-card commands', () => {
    expect(parseBookmarkStatePayload({ type: 'word', wordId: 'word-1', bookmarked: true })).toEqual({
      type: 'word', wordId: 'word-1', bookmarked: true,
    })
    expect(parseBookmarkStatePayload({ type: 'storyCard', lessonId: ' lesson-1 ', paragraphIndex: 0, bookmarked: false })).toEqual({
      type: 'storyCard', lessonId: 'lesson-1', paragraphIndex: 0, bookmarked: false,
    })
    expect(parseBookmarkStatePayload({ type: 'word', wordId: 'word-1' })).toBeNull()
    expect(parseBookmarkStatePayload({ type: 'storyCard', lessonId: 'lesson-1', paragraphIndex: -1, bookmarked: true })).toBeNull()
  })
})

describe('story-card bookmark persistence', () => {
  it('sets and unsets one normalized bookmark idempotently under retries', async () => {
    const lesson = { id: 'lesson-1', order: 1, title: 'First', contentJson: content('First', 1, 3) }
    let bookmark: {
      id: string
      lessonId: string
      paragraphIndex: number
      createdAt: Date
      lesson: typeof lesson
    } | null = null
    const upsert = vi.fn(async (_args: unknown) => {
      bookmark ??= { id: 'bookmark-1', lessonId: 'lesson-1', paragraphIndex: 1, createdAt: new Date('2026-09-02T00:00:00.000Z'), lesson }
      return bookmark
    })
    const prisma = {
      storyLesson: { async findFirst() { return lesson } },
      userStoryParagraphBookmark: {
        async findMany() { return [] },
        upsert,
        async deleteMany() {
          const count = bookmark === null ? 0 : 1
          bookmark = null
          return { count }
        },
      },
    }

    const base = { prisma, userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 1 }
    await expect(setStoryCardBookmark({ ...base, bookmarked: true })).resolves.toMatchObject({
      bookmarked: true,
      bookmark: { type: 'storyCard', lessonId: 'lesson-1', paragraphIndex: 1, sceneTitle: 'scene-1' },
    })
    await expect(setStoryCardBookmark({ ...base, bookmarked: true })).resolves.toMatchObject({ bookmarked: true })
    await expect(setStoryCardBookmark({ ...base, bookmarked: false })).resolves.toEqual({
      bookmarked: false,
      bookmark: null,
    })
    await expect(setStoryCardBookmark({ ...base, bookmarked: false })).resolves.toEqual({
      bookmarked: false,
      bookmark: null,
    })
    expect(upsert.mock.calls[0]?.[0]).not.toHaveProperty('include')
  })

  it.each([
    ['set finishes last', true],
    ['unset finishes last', false],
  ] as const)('linearizes concurrent set and unset when %s', async (_label, setFinishesLast) => {
    const lesson = { id: 'lesson-1', order: 1, title: 'First', contentJson: content('First', 1, 3) }
    let bookmark: {
      id: string
      lessonId: string
      paragraphIndex: number
      createdAt: Date
      lesson: typeof lesson
    } | null = null
    let releaseSet: () => void = () => undefined
    let releaseUnset: () => void = () => undefined
    const waitForSet = new Promise<void>((resolve) => { releaseSet = resolve })
    const waitForUnset = new Promise<void>((resolve) => { releaseUnset = resolve })
    const prisma = {
      storyLesson: { async findFirst() { return lesson } },
      userStoryParagraphBookmark: {
        async findMany() { return [] },
        async upsert() {
          await waitForSet
          bookmark = { id: 'bookmark-1', lessonId: 'lesson-1', paragraphIndex: 1, createdAt: new Date(), lesson }
          return bookmark
        },
        async deleteMany() {
          await waitForUnset
          bookmark = null
          return { count: 1 }
        },
      },
    }
    const base = { prisma, userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 1 }

    const setPromise = setStoryCardBookmark({ ...base, bookmarked: true })
    const unsetPromise = setStoryCardBookmark({ ...base, bookmarked: false })
    if (setFinishesLast) {
      releaseUnset()
      await unsetPromise
      releaseSet()
    } else {
      releaseSet()
      await setPromise
      releaseUnset()
    }
    const [setResult, unsetResult] = await Promise.all([setPromise, unsetPromise])

    expect(setResult.bookmarked).toBe(true)
    expect(unsetResult).toEqual({ bookmarked: false, bookmark: null })
    expect(bookmark !== null).toBe(setFinishesLast)
  })
})

describe('ready story references', () => {
  it('maps lesson-word sortOrder to a stable paragraph and returns deterministic course order', async () => {
    const prisma = {
      storyLessonWord: {
        async findMany() {
          return [
            { sortOrder: 7, lesson: { id: 'lesson-2', order: 2, title: 'Second', contentJson: content('Second', 2, 7) } },
            { sortOrder: 3, lesson: { id: 'lesson-1', order: 1, title: 'First', contentJson: content('First', 1, 3) } },
          ]
        },
      },
    }

    await expect(listReadyStoryReferences({ prisma, wordId: 'word-alpha' })).resolves.toEqual([
      { lessonId: 'lesson-1', lessonOrder: 1, lessonTitle: 'First', paragraphIndex: 1, sceneTitle: 'scene-1', wordOrder: 3 },
      { lessonId: 'lesson-2', lessonOrder: 2, lessonTitle: 'Second', paragraphIndex: 1, sceneTitle: 'scene-2', wordOrder: 7 },
    ])
  })
})
