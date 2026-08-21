import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getLocalUserId: vi.fn(),
  listStoryLessons: vi.fn(),
  getStoryLesson: vi.fn(),
  saveFirstPassStep: vi.fn(),
  listStoryLessonWords: vi.fn(),
  getDueStoryWords: vi.fn(),
  submitStoryReview: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { mocked: true },
  getLocalUserId: mocks.getLocalUserId,
}))

vi.mock('@/lib/story-service', () => ({
  listStoryLessons: mocks.listStoryLessons,
  getStoryLesson: mocks.getStoryLesson,
  saveFirstPassStep: mocks.saveFirstPassStep,
  listStoryLessonWords: mocks.listStoryLessonWords,
}))

vi.mock('@/lib/story-review', () => ({
  getDueStoryWords: mocks.getDueStoryWords,
  submitStoryReview: mocks.submitStoryReview,
}))

import { GET as getLessons } from '../app/api/story/lessons/route'
import { GET as getLesson } from '../app/api/story/lessons/[id]/route'
import { POST as postProgress } from '../app/api/story/lessons/[id]/progress/route'
import { GET as getLessonWords } from '../app/api/story/lessons/[id]/words/route'
import { GET as getReviewQueue, POST as postReview } from '../app/api/story/review/route'
import {
  classifyStoryApiError,
  parseStoryProgressPayload,
  parseStoryReviewApiResponse,
  parseStoryReviewPayload,
  parseStoryWordsQuery,
} from './story-api-types'
import type { StoryLessonApiResponse } from './story-api-types'
import { STORY_ERROR_CODES, StoryDomainError } from './story-errors'

const lessonOne = {
  id: 'lesson-1',
  order: 1,
  title: '第一篇',
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第二章',
  targetWordCount: 2,
  status: 'first_passed',
  completedStep: 3,
  currentStep: 4,
  dueReviewCount: 2,
}

const lessonTwo = {
  id: 'lesson-2',
  order: 2,
  title: '第二篇',
  sourceChapterStart: '第三章',
  sourceChapterEnd: '第四章',
  targetWordCount: 2,
  status: 'learning',
  completedStep: 1,
  currentStep: 2,
  dueReviewCount: 1,
}

const progress = {
  userId: 'user-1',
  lessonId: 'lesson-2',
  status: 'learning',
  currentStep: 2,
  completedStep: 1,
  step1CompletedAt: '2026-08-21T01:00:00.000Z',
  step2CompletedAt: null,
  step3CompletedAt: null,
  completedAt: null,
}

const detail = {
  id: 'lesson-1',
  order: 1,
  title: '第一篇',
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第二章',
  content: {
    title: '第一篇',
    order: 1,
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第二章',
    sourceSummary: '开端',
    continuityNotes: '继续',
    paragraphs: [{
      sceneTitle: '山寨晨雾',
      segments: [{ type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', wordOrder: 1 }],
    }],
  },
  lessonWords: [{
    id: 'lesson-word-1',
    sortOrder: 1,
    glossCn: '阿尔法',
    word: { id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/' },
    meaning: { id: 'meaning-alpha', partOfSpeech: 'n.', definition: 'alpha', definitionCn: '阿尔法', example: null },
  }],
  progress: { ...progress, lessonId: 'lesson-1', status: 'first_passed', currentStep: 4, completedStep: 3, step2CompletedAt: '2026-08-21T02:00:00.000Z', step3CompletedAt: '2026-08-21T03:00:00.000Z', completedAt: '2026-08-21T03:00:00.000Z' },
  dueReviewCount: 2,
  reviewState: {
    words: [{ lessonWordId: 'lesson-word-1', roundCompleted: 2, nextReviewAt: '2026-08-24T08:00:00.000Z' }],
    attempts: [
      { lessonWordId: 'lesson-word-1', round: 1, result: 'vague' },
      { lessonWordId: 'lesson-word-1', round: 2, result: 'remembered' },
    ],
  },
}

const dueWords = [
  {
    lessonWordId: 'lesson-word-2',
    lessonId: 'lesson-2',
    lessonOrder: 2,
    lessonTitle: '第二篇',
    sortOrder: 1,
    wordId: 'word-beta',
    meaningId: 'meaning-beta',
    word: 'beta',
    glossCn: '贝塔',
    definitionCn: '贝塔',
    dueRound: 1,
    roundCompleted: 0,
    nextReviewAt: null,
  },
  {
    lessonWordId: 'lesson-word-1',
    lessonId: 'lesson-1',
    lessonOrder: 1,
    lessonTitle: '第一篇',
    sortOrder: 1,
    wordId: 'word-alpha',
    meaningId: 'meaning-alpha',
    word: 'alpha',
    glossCn: '阿尔法',
    definitionCn: '阿尔法',
    dueRound: 2,
    roundCompleted: 1,
    nextReviewAt: '2026-08-20T00:00:00.000Z',
  },
]

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalUserId.mockResolvedValue('user-1')
  mocks.listStoryLessons.mockResolvedValue([])
  mocks.getStoryLesson.mockResolvedValue(null)
  mocks.saveFirstPassStep.mockResolvedValue(progress)
  mocks.listStoryLessonWords.mockResolvedValue(null)
  mocks.getDueStoryWords.mockResolvedValue([])
  mocks.submitStoryReview.mockResolvedValue({
    lessonWordId: 'lesson-word-1',
    round: 2,
    roundCompleted: 2,
    nextReviewAt: new Date('2026-08-23T00:00:00.000Z'),
    result: 'vague',
    grade: 2,
    userWordMeaningMastery: 65,
    userWordMastery: 60,
  })
})

describe('story API payload parsers', () => {
  it('accepts only first-pass steps and the exact review result identifiers', () => {
    expect(parseStoryProgressPayload({ step: 3 })).toEqual({ step: 3 })
    expect(parseStoryProgressPayload({ step: 4 })).toBeNull()
    expect(parseStoryReviewPayload({ lessonWordId: ' lesson-word-1 ', result: 'vague' })).toEqual({ lessonWordId: 'lesson-word-1', result: 'vague' })
    expect(parseStoryReviewPayload({ lessonWordId: 'lesson-word-1', result: 'fuzzy' })).toBeNull()
  })

  it('accepts only a complete POST review response matching the requested due round', () => {
    const response = {
      review: {
        lessonWordId: 'lesson-word-1',
        round: 2,
        roundCompleted: 2,
        result: 'vague',
        nextReviewAt: '2026-08-24T08:00:00.000Z',
        grade: 2,
        userWordMeaningMastery: 65,
        userWordMastery: 60,
      },
    }
    const expected = {
      lessonWordId: 'lesson-word-1',
      round: 2,
      result: 'vague',
      submittedAt: new Date('2026-08-24T07:00:00.000Z'),
    } as const

    expect(parseStoryReviewApiResponse(response, expected)).toEqual(response.review)
    expect(parseStoryReviewApiResponse({}, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, lessonWordId: 'other-word' } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, round: 6, roundCompleted: 6 } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, round: 1, roundCompleted: 1 } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, result: 'fuzzy' } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, nextReviewAt: 'not-a-date' } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, nextReviewAt: null } }, expected)).toBeNull()
    expect(parseStoryReviewApiResponse({ review: { ...response.review, round: 5, roundCompleted: 5, nextReviewAt: null } }, { ...expected, round: 5 })).toEqual({ ...response.review, round: 5, roundCompleted: 5, nextReviewAt: null })
  })

  it.each([
    ['a past canonical timestamp', { nextReviewAt: '2026-08-24T06:59:59.999Z' }],
    ['a parseable noncanonical timestamp', { nextReviewAt: '2026-08-24T08:00:00Z' }],
    ['a grade that does not match the submitted result', { grade: 0 }],
  ])('rejects review responses with %s', (_case, invalidFields) => {
    const response = {
      review: {
        lessonWordId: 'lesson-word-1',
        round: 2,
        roundCompleted: 2,
        result: 'vague',
        nextReviewAt: '2026-08-24T08:00:00.000Z',
        grade: 2,
        userWordMeaningMastery: 65,
        userWordMastery: 60,
        ...invalidFields,
      },
    }

    expect(parseStoryReviewApiResponse(response, {
      lessonWordId: 'lesson-word-1',
      round: 2,
      result: 'vague',
      submittedAt: new Date('2026-08-24T07:00:00.000Z'),
    })).toBeNull()
  })

  it.each([
    ['remembered', 4],
    ['vague', 2],
    ['forgotten', 0],
  ] as const)('accepts %s only with its deterministic grade %i', (result, grade) => {
    const response = {
      review: {
        lessonWordId: 'lesson-word-1',
        round: 1,
        roundCompleted: 1,
        result,
        nextReviewAt: '2026-08-24T08:00:00.000Z',
        grade,
        userWordMeaningMastery: 65,
        userWordMastery: 60,
      },
    }

    expect(parseStoryReviewApiResponse(response, {
      lessonWordId: 'lesson-word-1',
      round: 1,
      result,
      submittedAt: new Date('2026-08-24T07:00:00.000Z'),
    })).toEqual(response.review)
  })

  it('normalizes supported word filters and rejects unsafe pagination', () => {
    expect(parseStoryWordsQuery(new URLSearchParams('query=%20Alpha%20&scene=%20%E6%99%A8%E9%9B%BE%20&page=2&pageSize=50'))).toEqual({
      query: 'Alpha',
      scene: '晨雾',
      page: 2,
      pageSize: 50,
    })
    expect(parseStoryWordsQuery(new URLSearchParams('page=0'))).toBeNull()
    expect(parseStoryWordsQuery(new URLSearchParams('pageSize=101'))).toBeNull()
  })
})

describe('story API error classification', () => {
  it('maps only stable story domain error codes to contract statuses', () => {
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.READY_COURSE_NOT_FOUND, 'ready course missing'))).toBe(404)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.LESSON_NOT_FOUND, 'lesson missing'))).toBe(404)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.LESSON_WORD_NOT_FOUND, 'word missing'))).toBe(404)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.LESSON_WORD_NOT_REVIEWABLE, 'Step3 incomplete'))).toBe(404)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.PROGRESS_SEQUENCE_CONFLICT, 'step conflict'))).toBe(409)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.REVIEW_NOT_DUE, 'not due'))).toBe(409)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.REVIEW_ROUNDS_COMPLETE, 'rounds complete'))).toBe(409)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.REVIEW_RESULT_CONFLICT, 'result conflict'))).toBe(409)
    expect(classifyStoryApiError(new StoryDomainError(STORY_ERROR_CODES.REVIEW_RETRY_EXHAUSTED, 'retry exhaustion'))).toBe(409)
  })

  it('keeps infrastructure errors generic even when their messages resemble domain failures', () => {
    expect(classifyStoryApiError(new Error('database failure: Story lesson is not ready or does not exist'))).toBe(500)
    expect(classifyStoryApiError(new Error('proxy failure: already committed with a different result'))).toBe(500)
    expect(classifyStoryApiError({ code: STORY_ERROR_CODES.REVIEW_RETRY_EXHAUSTED, message: 'untrusted object' })).toBe(500)
  })
})

describe('GET /api/story/lessons', () => {
  it('returns ordered lessons, the first incomplete lesson, and the total due count', async () => {
    mocks.listStoryLessons.mockResolvedValue([lessonOne, lessonTwo])

    const response = await getLessons()

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({
      lessons: [lessonOne, lessonTwo],
      currentLessonId: 'lesson-2',
      dueCount: 3,
    })
    expect(mocks.listStoryLessons).toHaveBeenCalledWith({ prisma: { mocked: true }, userId: 'user-1' })
  })
})

describe('GET /api/story/lessons/[id]', () => {
  it('returns one ready lesson with persisted Step4 state while stripping generator metadata', async () => {
    mocks.getStoryLesson.mockResolvedValue(detail)

    const response = await getLesson(new NextRequest('http://localhost/api/story/lessons/lesson-1'), routeContext('lesson-1'))

    expect(response.status).toBe(200)
    const body = await responseJson(response)
    expect(body).toEqual({
      lesson: {
        ...detail,
        content: {
          title: detail.content.title,
          order: detail.content.order,
          sourceChapterStart: detail.content.sourceChapterStart,
          sourceChapterEnd: detail.content.sourceChapterEnd,
          paragraphs: detail.content.paragraphs,
        },
      },
    })
    const publicContent = (body as StoryLessonApiResponse).lesson.content
    expect(publicContent).not.toHaveProperty('sourceSummary')
    expect(publicContent).not.toHaveProperty('continuityNotes')
    expect(mocks.getStoryLesson).toHaveBeenCalledWith({ prisma: { mocked: true }, userId: 'user-1', lessonId: 'lesson-1' })
  })

  it('returns 404 for a lesson outside ready-course visibility', async () => {
    const response = await getLesson(new NextRequest('http://localhost/api/story/lessons/hidden'), routeContext('hidden'))

    expect(response.status).toBe(404)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Story lesson not found' })
  })
})

describe('POST /api/story/lessons/[id]/progress', () => {
  it('returns 400 for malformed JSON or an invalid step', async () => {
    const malformed = new NextRequest('http://localhost/api/story/lessons/lesson-2/progress', { method: 'POST', body: '{' })
    const malformedResponse = await postProgress(malformed, routeContext('lesson-2'))
    const invalidResponse = await postProgress(jsonRequest('http://localhost/api/story/lessons/lesson-2/progress', { step: 4 }), routeContext('lesson-2'))

    expect(malformedResponse.status).toBe(400)
    expect(invalidResponse.status).toBe(400)
    await expect(responseJson(invalidResponse)).resolves.toEqual({ error: 'Invalid story progress payload' })
    expect(mocks.saveFirstPassStep).not.toHaveBeenCalled()
  })

  it('saves user-scoped progress and returns the updated state', async () => {
    const response = await postProgress(jsonRequest('http://localhost/api/story/lessons/lesson-2/progress', { step: 1 }), routeContext('lesson-2'))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({ progress })
    expect(mocks.saveFirstPassStep).toHaveBeenCalledWith({ prisma: { mocked: true }, userId: 'user-1', lessonId: 'lesson-2', step: 1 })
  })

  it('maps missing lessons to 404 and out-of-sequence transitions to 409', async () => {
    mocks.saveFirstPassStep.mockRejectedValueOnce(new StoryDomainError(STORY_ERROR_CODES.LESSON_NOT_FOUND, 'Story lesson is not ready or does not exist: hidden'))
    const missing = await postProgress(jsonRequest('http://localhost/api/story/lessons/hidden/progress', { step: 1 }), routeContext('hidden'))

    mocks.saveFirstPassStep.mockRejectedValueOnce(new StoryDomainError(STORY_ERROR_CODES.PROGRESS_SEQUENCE_CONFLICT, 'Cannot complete Step3 before Step2'))
    const conflict = await postProgress(jsonRequest('http://localhost/api/story/lessons/lesson-2/progress', { step: 3 }), routeContext('lesson-2'))

    expect(missing.status).toBe(404)
    expect(conflict.status).toBe(409)
  })
})

describe('GET /api/story/lessons/[id]/words', () => {
  it('passes normalized query, scene, and pagination to the ready-scoped service', async () => {
    const result = {
      lessonId: 'lesson-1',
      words: [{ ...detail.lessonWords[0], sceneTitle: '山寨晨雾' }],
      scenes: ['山寨晨雾'],
      pagination: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
    }
    mocks.listStoryLessonWords.mockResolvedValue(result)

    const response = await getLessonWords(
      new NextRequest('http://localhost/api/story/lessons/lesson-1/words?query=%20alpha%20&scene=%20%E5%B1%B1%E5%AF%A8%E6%99%A8%E9%9B%BE%20&page=2'),
      routeContext('lesson-1'),
    )

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual(result)
    expect(mocks.listStoryLessonWords).toHaveBeenCalledWith({
      prisma: { mocked: true },
      userId: 'user-1',
      lessonId: 'lesson-1',
      query: 'alpha',
      scene: '山寨晨雾',
      page: 2,
      pageSize: 25,
    })
  })

  it('returns 400 for invalid query pagination and 404 for a hidden lesson', async () => {
    const invalid = await getLessonWords(new NextRequest('http://localhost/api/story/lessons/lesson-1/words?page=nope'), routeContext('lesson-1'))
    const hidden = await getLessonWords(new NextRequest('http://localhost/api/story/lessons/hidden/words'), routeContext('hidden'))

    expect(invalid.status).toBe(400)
    expect(hidden.status).toBe(404)
  })
})

describe('GET /api/story/review', () => {
  it('groups the due queue without changing service word order', async () => {
    mocks.getDueStoryWords.mockResolvedValue(dueWords)

    const response = await getReviewQueue(new NextRequest('http://localhost/api/story/review'))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({
      lessons: [
        { lessonId: 'lesson-2', lessonOrder: 2, lessonTitle: '第二篇', dueCount: 1, words: [dueWords[0]] },
        { lessonId: 'lesson-1', lessonOrder: 1, lessonTitle: '第一篇', dueCount: 1, words: [dueWords[1]] },
      ],
      dueCount: 2,
    })
  })
})

describe('POST /api/story/review', () => {
  it('rejects fuzzy and other invalid review identifiers with 400', async () => {
    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'fuzzy' }))

    expect(response.status).toBe(400)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Invalid story review payload' })
    expect(mocks.submitStoryReview).not.toHaveBeenCalled()
  })

  it('accepts vague and serializes the next review state', async () => {
    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: ' lesson-word-1 ', result: 'vague' }))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toEqual({
      review: {
        lessonWordId: 'lesson-word-1',
        round: 2,
        roundCompleted: 2,
        nextReviewAt: '2026-08-23T00:00:00.000Z',
        result: 'vague',
        grade: 2,
        userWordMeaningMastery: 65,
        userWordMastery: 60,
      },
    })
    expect(mocks.submitStoryReview).toHaveBeenCalledWith({ prisma: { mocked: true }, userId: 'user-1', lessonWordId: 'lesson-word-1', result: 'vague' })
  })

  it('returns idempotent success for an identical duplicate retry', async () => {
    mocks.submitStoryReview.mockResolvedValue({
      lessonWordId: 'lesson-word-1',
      round: 1,
      roundCompleted: 1,
      nextReviewAt: new Date('2026-08-22T00:00:00.000Z'),
      result: 'remembered',
      grade: 4,
      userWordMeaningMastery: 63,
      userWordMastery: 63,
    })

    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'remembered' }))

    expect(response.status).toBe(200)
    expect((await responseJson(response)).review).toMatchObject({ round: 1, roundCompleted: 1 })
  })

  it('maps unauthorized lesson words to 404 and conflicting immutable-round submissions to 409', async () => {
    mocks.submitStoryReview.mockRejectedValueOnce(new StoryDomainError(STORY_ERROR_CODES.LESSON_WORD_NOT_FOUND, 'Story lesson word is not in the current ready story course: hidden-word'))
    const unauthorized = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'hidden-word', result: 'remembered' }))

    mocks.submitStoryReview.mockRejectedValueOnce(new StoryDomainError(STORY_ERROR_CODES.REVIEW_RESULT_CONFLICT, 'Story review round 1 was already committed with a different result'))
    const conflict = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'forgotten' }))

    expect(unauthorized.status).toBe(404)
    expect(conflict.status).toBe(409)
  })

  it('maps review retry exhaustion to 409', async () => {
    mocks.submitStoryReview.mockRejectedValue(new StoryDomainError(
      STORY_ERROR_CODES.REVIEW_RETRY_EXHAUSTED,
      'Story review submission conflicted after retries',
    ))

    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'remembered' }))

    expect(response.status).toBe(409)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Story review conflict' })
  })

  it('does not map lookalike infrastructure messages to domain statuses', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.submitStoryReview.mockRejectedValue(new Error('database transport failed: already committed with a different result'))

    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'remembered' }))

    expect(response.status).toBe(500)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Internal server error' })
    consoleError.mockRestore()
  })

  it('does not treat a plain Prisma-code-shaped rejection as retry exhaustion', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.submitStoryReview.mockRejectedValue({ code: 'P2002', message: 'Unique constraint failed' })

    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'remembered' }))

    expect(response.status).toBe(500)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Internal server error' })
    consoleError.mockRestore()
  })

  it('returns a generic 500 without leaking internal database errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.submitStoryReview.mockRejectedValue(new Error('postgresql://secret@db.internal:5432/story'))

    const response = await postReview(jsonRequest('http://localhost/api/story/review', { lessonWordId: 'lesson-word-1', result: 'remembered' }))

    expect(response.status).toBe(500)
    await expect(responseJson(response)).resolves.toEqual({ error: 'Internal server error' })
    consoleError.mockRestore()
  })
})
