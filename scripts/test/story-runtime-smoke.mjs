import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { createFakeStoryPrisma } from './helpers/fake-story-prisma.mjs'

const injected = vi.hoisted(() => ({
  prisma: {},
  userId: 'story-runtime-smoke-user',
}))

vi.mock('@/lib/prisma', () => ({
  prisma: injected.prisma,
  getLocalUserId: vi.fn(async () => injected.userId),
}))

vi.mock('openai', () => {
  throw new Error('Runtime smoke loaded OpenAI; ready lessons must not require a runtime LLM')
})

import { GET as getLessons } from '../../src/app/api/story/lessons/route'
import { GET as getLesson } from '../../src/app/api/story/lessons/[id]/route'
import { POST as postProgress } from '../../src/app/api/story/lessons/[id]/progress/route'
import { GET as getReviewQueue, POST as postReview } from '../../src/app/api/story/review/route'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
function makeContent({ id, order, title, words }) {
  return JSON.stringify({
    title,
    order,
    sourceChapterStart: `fixture-${id}-start`,
    sourceChapterEnd: `fixture-${id}-end`,
    sourceSummary: 'Synthetic fixture summary; no novel text.',
    continuityNotes: 'Synthetic fixture continuity.',
    paragraphs: [
      {
        sceneTitle: 'Synthetic courtyard',
        segments: [
          { type: 'text', value: 'The fixture learner meets ' },
          ...words.flatMap((word, index) => [
            {
              type: 'targetWord',
              word: word.text,
              definitionCn: word.glossCn,
              phonetic: word.phonetic,
              wordOrder: index + 1,
            },
            { type: 'text', value: index === words.length - 1 ? '.' : ' and ' },
          ]),
        ],
      },
    ],
  })
}

function createSeededPrisma() {
  const words = [
    {
      id: 'fixture-word-resolve',
      text: 'resolve',
      phonetic: '/rɪˈzɒlv/',
      glossCn: '决心',
      meanings: [{
        id: 'fixture-meaning-resolve',
        partOfSpeech: 'n.',
        definition: 'firm determination',
        definitionCn: '坚定决心',
        example: 'The learner shows resolve.',
      }],
    },
    {
      id: 'fixture-word-vigilant',
      text: 'vigilant',
      phonetic: '/ˈvɪdʒɪlənt/',
      glossCn: '警觉的',
      meanings: [{
        id: 'fixture-meaning-vigilant',
        partOfSpeech: 'adj.',
        definition: 'watchful for danger',
        definitionCn: '对危险保持警觉',
        example: 'The learner remains vigilant.',
      }],
    },
    {
      id: 'fixture-word-advance',
      text: 'advance',
      phonetic: '/ədˈvɑːns/',
      glossCn: '前进',
      meanings: [{
        id: 'fixture-meaning-advance',
        partOfSpeech: 'v.',
        definition: 'move forward',
        definitionCn: '向前推进',
        example: 'The learner can advance.',
      }],
    },
  ]
  const prisma = createFakeStoryPrisma({ wordGroups: [{ id: 'fixture-group', words }] })

  prisma.state.courses.set('fixture-ready-course', {
    id: 'fixture-ready-course', version: 1, status: 'ready', readySlot: 'ready',
  })
  prisma.state.courses.set('fixture-draft-course', {
    id: 'fixture-draft-course', version: 2, status: 'draft', readySlot: null,
  })

  const firstLessonWords = words.slice(0, 2)
  prisma.state.lessons.set('fixture-lesson-1', {
    id: 'fixture-lesson-1',
    courseId: 'fixture-ready-course',
    order: 1,
    title: 'Synthetic lesson one',
    sourceChapterStart: 'fixture-one-start',
    sourceChapterEnd: 'fixture-one-end',
    contentJson: makeContent({ id: 'one', order: 1, title: 'Synthetic lesson one', words: firstLessonWords }),
    status: 'ready',
  })
  prisma.state.lessons.set('fixture-lesson-2', {
    id: 'fixture-lesson-2',
    courseId: 'fixture-ready-course',
    order: 2,
    title: 'Synthetic lesson two',
    sourceChapterStart: 'fixture-two-start',
    sourceChapterEnd: 'fixture-two-end',
    contentJson: makeContent({ id: 'two', order: 2, title: 'Synthetic lesson two', words: words.slice(2) }),
    status: 'ready',
  })
  prisma.state.lessons.set('fixture-hidden-draft-lesson', {
    id: 'fixture-hidden-draft-lesson',
    courseId: 'fixture-ready-course',
    order: 3,
    title: 'Hidden draft lesson',
    sourceChapterStart: 'hidden',
    sourceChapterEnd: 'hidden',
    contentJson: makeContent({ id: 'hidden', order: 3, title: 'Hidden draft lesson', words: words.slice(2) }),
    status: 'draft',
  })
  prisma.state.lessons.set('fixture-other-course-lesson', {
    id: 'fixture-other-course-lesson',
    courseId: 'fixture-draft-course',
    order: 1,
    title: 'Other course lesson',
    sourceChapterStart: 'other',
    sourceChapterEnd: 'other',
    contentJson: makeContent({ id: 'other', order: 1, title: 'Other course lesson', words: words.slice(2) }),
    status: 'ready',
  })

  for (const [index, word] of firstLessonWords.entries()) {
    prisma.state.lessonWords.set(`fixture-lesson-word-${index + 1}`, {
      id: `fixture-lesson-word-${index + 1}`,
      lessonId: 'fixture-lesson-1',
      wordId: word.id,
      meaningId: word.meanings[0].id,
      sortOrder: index + 1,
      glossCn: word.glossCn,
    })
  }
  prisma.state.lessonWords.set('fixture-next-lesson-word', {
    id: 'fixture-next-lesson-word',
    lessonId: 'fixture-lesson-2',
    wordId: words[2].id,
    meaningId: words[2].meanings[0].id,
    sortOrder: 1,
    glossCn: words[2].glossCn,
  })
  prisma.state.lessonWords.set('fixture-other-course-word', {
    id: 'fixture-other-course-word',
    lessonId: 'fixture-other-course-lesson',
    wordId: words[2].id,
    meaningId: words[2].meanings[0].id,
    sortOrder: 1,
    glossCn: words[2].glossCn,
  })

  return prisma
}

function jsonRequest(url, body) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function responseJson(response) {
  return JSON.parse(await response.text())
}

async function saveStep(step) {
  return postProgress(
    jsonRequest('http://runtime.test/api/story/lessons/fixture-lesson-1/progress', { step }),
    { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
  )
}

beforeEach(() => {
  const prisma = createSeededPrisma()
  for (const key of Reflect.ownKeys(injected.prisma)) delete injected.prisma[key]
  Object.assign(injected.prisma, prisma)
})

describe('story runtime smoke', () => {
  it('persists one ready-course journey through Step1-Step4 without blocking the next lesson', async () => {
    const initialListResponse = await getLessons()
    expect(initialListResponse.status).toBe(200)
    expect(await responseJson(initialListResponse)).toEqual({
      lessons: [
        expect.objectContaining({ id: 'fixture-lesson-1', order: 1, targetWordCount: 2, completedStep: 0 }),
        expect.objectContaining({ id: 'fixture-lesson-2', order: 2, targetWordCount: 1, completedStep: 0 }),
      ],
      currentLessonId: 'fixture-lesson-1',
      dueCount: 0,
    })

    const detailResponse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-lesson-1'),
      { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
    )
    expect(detailResponse.status).toBe(200)
    const initialDetail = (await responseJson(detailResponse)).lesson
    expect(initialDetail.content.paragraphs).toEqual([
      expect.objectContaining({
        sceneTitle: 'Synthetic courtyard',
        segments: expect.arrayContaining([
          expect.objectContaining({ type: 'targetWord', word: 'resolve', definitionCn: '决心', wordOrder: 1 }),
          expect.objectContaining({ type: 'targetWord', word: 'vigilant', definitionCn: '警觉的', wordOrder: 2 }),
        ]),
      }),
    ])
    expect(initialDetail.content).not.toHaveProperty('sourceSummary')
    expect(initialDetail.content).not.toHaveProperty('continuityNotes')

    for (const [step, expected] of [
      [1, { completedStep: 1, currentStep: 2, status: 'learning' }],
      [2, { completedStep: 2, currentStep: 3, status: 'learning' }],
      [3, { completedStep: 3, currentStep: 4, status: 'first_passed' }],
    ]) {
      const response = await saveStep(step)
      expect(response.status).toBe(200)
      expect((await responseJson(response)).progress).toMatchObject(expected)
    }

    const unlockedListResponse = await getLessons()
    const unlockedList = await responseJson(unlockedListResponse)
    expect(unlockedList.currentLessonId).toBe('fixture-lesson-2')
    expect(unlockedList.dueCount).toBe(2)
    expect(unlockedList.lessons[0]).toMatchObject({
      id: 'fixture-lesson-1', completedStep: 3, currentStep: 4, dueReviewCount: 2,
    })

    const queueResponse = await getReviewQueue(
      new NextRequest('http://runtime.test/api/story/review?lessonId=fixture-lesson-1'),
    )
    expect(queueResponse.status).toBe(200)
    const queue = await responseJson(queueResponse)
    expect(queue).toMatchObject({ dueCount: 2 })
    expect(queue.lessons[0].words.map((word) => word.lessonWordId)).toEqual([
      'fixture-lesson-word-1',
      'fixture-lesson-word-2',
    ])
    expect(queue.lessons[0].words.every((word) => word.dueRound === 1 && word.nextReviewAt === null)).toBe(true)

    const invalidIdentifierResponse = await postReview(jsonRequest(
      'http://runtime.test/api/story/review',
      { lessonWordId: 'fixture-lesson-word-1', result: 'remember' },
    ))
    expect(invalidIdentifierResponse.status).toBe(400)

    const reviewStartedAt = Date.now()
    const reviewResponse = await postReview(jsonRequest(
      'http://runtime.test/api/story/review',
      { lessonWordId: 'fixture-lesson-word-1', result: 'remembered' },
    ))
    expect(reviewResponse.status).toBe(200)
    const submittedReview = (await responseJson(reviewResponse)).review
    expect(submittedReview).toMatchObject({
      lessonWordId: 'fixture-lesson-word-1',
      round: 1,
      roundCompleted: 1,
      result: 'remembered',
      grade: 4,
    })
    expect(new Date(submittedReview.nextReviewAt).getTime()).toBeGreaterThan(reviewStartedAt)

    const reloadedDetailResponse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-lesson-1'),
      { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
    )
    const reloadedDetail = (await responseJson(reloadedDetailResponse)).lesson
    expect(reloadedDetail.progress).toMatchObject({ completedStep: 3, currentStep: 4, status: 'first_passed' })
    expect(reloadedDetail.reviewState).toEqual({
      words: [
        { lessonWordId: 'fixture-lesson-word-1', roundCompleted: 1, nextReviewAt: submittedReview.nextReviewAt },
        { lessonWordId: 'fixture-lesson-word-2', roundCompleted: 0, nextReviewAt: null },
      ],
      attempts: [{ lessonWordId: 'fixture-lesson-word-1', round: 1, result: 'remembered' }],
    })

    const reloadedList = await responseJson(await getLessons())
    expect(reloadedList).toMatchObject({ currentLessonId: 'fixture-lesson-2', dueCount: 1 })
    expect(reloadedList.lessons[1]).toMatchObject({ id: 'fixture-lesson-2', completedStep: 0 })
  })

  it('scopes reads to the ready slot and has no runtime novel or LLM dependency', async () => {
    const hiddenDraft = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-hidden-draft-lesson'),
      { params: Promise.resolve({ id: 'fixture-hidden-draft-lesson' }) },
    )
    const otherCourse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-other-course-lesson'),
      { params: Promise.resolve({ id: 'fixture-other-course-lesson' }) },
    )
    expect(hiddenDraft.status).toBe(404)
    expect(otherCourse.status).toBe(404)

    const rawNovelPath = join(projectRoot, '蛊真人.txt')
    expect(existsSync(rawNovelPath)).toBe(false)

    const runtimeFiles = [
      'src/app/api/story/lessons/route.ts',
      'src/app/api/story/lessons/[id]/route.ts',
      'src/app/api/story/lessons/[id]/progress/route.ts',
      'src/app/api/story/review/route.ts',
      'src/lib/story-service.ts',
      'src/lib/story-review.ts',
    ]
    const runtimeSource = (await Promise.all(runtimeFiles.map((file) => readFile(join(projectRoot, file), 'utf8')))).join('\n')
    expect(runtimeSource).not.toMatch(/蛊真人\.txt|from ['"](?:@\/lib\/llm|openai|node:fs|node:fs\/promises)['"]|scripts\/(?:parse-novel|generate-story-lessons)/)
  })
})
