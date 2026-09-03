import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getLocalUserId: vi.fn(),
  userWordFindMany: vi.fn(),
  userWordUpdateMany: vi.fn(),
  wordFindUnique: vi.fn(),
  listStoryCardBookmarks: vi.fn(),
  setStoryCardBookmark: vi.fn(),
  listReadyStoryReferences: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  getLocalUserId: mocks.getLocalUserId,
  prisma: {
    userWord: {
      findMany: mocks.userWordFindMany,
      updateMany: mocks.userWordUpdateMany,
    },
    word: { findUnique: mocks.wordFindUnique },
  },
}))
vi.mock('@/lib/story-bookmarks', () => ({
  listStoryCardBookmarks: mocks.listStoryCardBookmarks,
  setStoryCardBookmark: mocks.setStoryCardBookmark,
}))
vi.mock('@/lib/story-references', () => ({ listReadyStoryReferences: mocks.listReadyStoryReferences }))

import { GET as getBookmarks } from '../app/api/bookmarks/route'
import { POST as toggleBookmark } from '../app/api/bookmarks/toggle/route'
import { GET as getWord } from '../app/api/words/[id]/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalUserId.mockResolvedValue('user-1')
  mocks.userWordFindMany.mockResolvedValue([{
    id: 'user-word-1',
    wordId: 'word-1',
    bookmarked: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    word: { id: 'word-1', text: 'alpha', meanings: [{ id: 'meaning-1', userWordMeanings: [] }] },
  }])
  mocks.listStoryCardBookmarks.mockResolvedValue([{
    type: 'storyCard',
    id: 'story-bookmark-1',
    lessonId: 'lesson-1',
    lessonOrder: 1,
    lessonTitle: 'First',
    paragraphIndex: 0,
    sceneTitle: 'Opening',
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
  }])
  mocks.setStoryCardBookmark.mockResolvedValue({ bookmarked: true, bookmark: { id: 'story-bookmark-1' } })
  mocks.listReadyStoryReferences.mockResolvedValue([{
    lessonId: 'lesson-1', lessonOrder: 1, lessonTitle: 'First', paragraphIndex: 0, sceneTitle: 'Opening', wordOrder: 1,
  }])
})

describe('GET /api/bookmarks', () => {
  it('returns a discriminated union sorted across word and story-card bookmarks', async () => {
    const response = await getBookmarks()
    const body = await response.json()

    expect(body.bookmarks.map((bookmark: { type: string }) => bookmark.type)).toEqual(['storyCard', 'word'])
    expect(body.bookmarks[1]).toMatchObject({ type: 'word', id: 'user-word-1', bookmarked: true })
  })
})

describe('POST /api/bookmarks/toggle', () => {
  it('routes a storyCard variant without touching UserWord.bookmarked', async () => {
    const response = await toggleBookmark(new NextRequest('http://localhost/api/bookmarks/toggle', {
      method: 'POST',
      body: JSON.stringify({ type: 'storyCard', lessonId: 'lesson-1', paragraphIndex: 0, bookmarked: true }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ type: 'storyCard', bookmarked: true })
    expect(mocks.setStoryCardBookmark).toHaveBeenCalledWith({
      prisma: expect.any(Object), userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 0, bookmarked: true,
    })
    expect(mocks.userWordUpdateMany).not.toHaveBeenCalled()
  })

  it('sets the requested word state instead of toggling the stored state', async () => {
    mocks.userWordUpdateMany.mockResolvedValue({ count: 1 })

    const response = await toggleBookmark(new NextRequest('http://localhost/api/bookmarks/toggle', {
      method: 'POST',
      body: JSON.stringify({ type: 'word', wordId: 'word-1', bookmarked: false }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.userWordUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', wordId: 'word-1' },
      data: { bookmarked: false },
    })
  })

  it('returns not found when the word leaves the user library during the desired-state write', async () => {
    mocks.userWordUpdateMany.mockResolvedValue({ count: 0 })

    const response = await toggleBookmark(new NextRequest('http://localhost/api/bookmarks/toggle', {
      method: 'POST',
      body: JSON.stringify({ type: 'word', wordId: 'word-1', bookmarked: true }),
    }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Word not in your library' })
  })
})

describe('GET /api/words/[id]', () => {
  it('adds deterministic ready-course storyReferences to the existing word response', async () => {
    mocks.wordFindUnique.mockResolvedValue({
      id: 'word-1',
      meanings: [{ example: 'example', userWordMeanings: [] }],
      userWords: [],
      groups: [],
    })

    const response = await getWord(
      new NextRequest('http://localhost/api/words/word-1'),
      { params: Promise.resolve({ id: 'word-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      word: { id: 'word-1' },
      storyReferences: [{ lessonId: 'lesson-1', paragraphIndex: 0 }],
    })
    expect(mocks.listReadyStoryReferences).toHaveBeenCalledWith({ prisma: expect.any(Object), wordId: 'word-1' })
  })
})
