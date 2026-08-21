import { describe, expect, it } from 'vitest'

import {
  getStoryLesson,
  listStoryLessons,
  saveFirstPassStep,
} from './story-service'

const readySlot = 'ready'

function makeContent({ title = 'Ready Lesson', order = 1 } = {}) {
  return JSON.stringify({
    title,
    order,
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第二章',
    sourceSummary: '青茅山开端。',
    continuityNotes: '后续进入学堂。',
    paragraphs: [
      {
        sceneTitle: '山寨晨雾',
        segments: [
          { type: 'text', value: '方源看着 ' },
          { type: 'targetWord', word: 'dawn', definitionCn: '黎明', wordOrder: 1 },
          { type: 'text', value: '。' },
        ],
      },
    ],
  })
}

type CourseRow = { id: string; status: string; readySlot: string | null }
type ProgressRow = {
  id?: string
  userId: string
  lessonId: string
  currentStep: number
  status: string
  step1CompletedAt: Date | null
  step2CompletedAt: Date | null
  step3CompletedAt: Date | null
  completedAt: Date | null
}
type WordProgressRow = {
  userId: string
  lessonWordId: string
  reviewRoundCompleted: number
  nextReviewAt: Date | null
}
type LessonWordRow = {
  id: string
  lessonId: string
  wordId: string
  meaningId: string
  sortOrder: number
  glossCn: string
  word: { id: string; text: string }
  meaning: { id: string; partOfSpeech: string; definition: string; definitionCn: string | null; example: string | null }
  userProgress?: WordProgressRow[]
}
type LessonRow = {
  id: string
  courseId: string
  order: number
  title: string
  sourceChapterStart: string
  sourceChapterEnd: string
  contentJson: string
  status: string
  words: LessonWordRow[]
  userProgress?: ProgressRow[]
}


type ServiceFakePrisma = {
  now: Date
  calls: string[]
  state: {
    courses: CourseRow[]
    lessons: LessonRow[]
    progress: ProgressRow[]
    wordProgress: WordProgressRow[]
    nextProgress: number
  }
  $transaction<T>(callback: (tx: ServiceFakePrisma) => Promise<T>): Promise<T>
  storyCourse: {
    findUnique(args: { where: { readySlot?: string; id?: string } }): Promise<CourseRow | null>
    findMany(): Promise<never>
    findFirst(): Promise<never>
  }
  storyLesson: {
    findMany(args: { where: Record<string, unknown>; orderBy?: { order: 'asc' }; include?: Record<string, unknown> }): Promise<LessonRow[]>
    findFirst(args: { where: Record<string, unknown>; include?: Record<string, unknown> }): Promise<LessonRow | null>
  }
  userStoryProgress: {
    findUnique(args: { where: { userId_lessonId: { userId: string; lessonId: string } } }): Promise<ProgressRow | null>
    upsert(args: { where: { userId_lessonId: { userId: string; lessonId: string } }; create: ProgressRow; update: Partial<ProgressRow> }): Promise<ProgressRow>
  }
}

function makeLesson(overrides: Partial<LessonRow> = {}): LessonRow {
  const id = overrides.id ?? 'lesson-ready-1'
  return {
    id,
    courseId: 'course-ready',
    order: 1,
    title: 'Ready Lesson',
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第二章',
    contentJson: makeContent(),
    status: 'ready',
    words: [
      {
        id: `${id}-word-2`,
        lessonId: id,
        wordId: 'word-beta',
        meaningId: 'meaning-beta',
        sortOrder: 2,
        glossCn: '贝塔',
        word: { id: 'word-beta', text: 'beta' },
        meaning: { id: 'meaning-beta', partOfSpeech: 'n.', definition: 'beta', definitionCn: '贝塔', example: null },
      },
      {
        id: `${id}-word-1`,
        lessonId: id,
        wordId: 'word-alpha',
        meaningId: 'meaning-alpha',
        sortOrder: 1,
        glossCn: '阿尔法',
        word: { id: 'word-alpha', text: 'alpha' },
        meaning: { id: 'meaning-alpha', partOfSpeech: 'n.', definition: 'alpha', definitionCn: '阿尔法', example: 'alpha example' },
      },
    ],
    ...overrides,
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && 'lte' in expected) {
      return actual instanceof Date && actual <= (expected as { lte: Date }).lte
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && 'lt' in expected) {
      return typeof actual === 'number' && actual < (expected as { lt: number }).lt
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && 'not' in expected) {
      return actual !== (expected as { not: unknown }).not
    }
    return actual === expected
  })
}

function createServicePrisma({
  courses = [{ id: 'course-ready', status: 'ready', readySlot }] as CourseRow[],
  lessons = [makeLesson()],
  progress = [] as ProgressRow[],
  wordProgress = [] as WordProgressRow[],
  now = new Date('2026-08-21T00:00:00.000Z'),
} = {}) {
  const state = {
    courses: clone(courses),
    lessons: clone(lessons),
    progress: clone(progress),
    wordProgress: clone(wordProgress),
    nextProgress: 1,
  }
  const calls: string[] = []

  const attachRelations = (lesson: LessonRow, args: { include?: Record<string, unknown> } = {}) => {
    const row = clone(lesson)
    if (args.include?.userProgress) {
      row.userProgress = state.progress.filter((item) => item.lessonId === row.id && item.userId === 'user-1').map(clone)
    }
    if (args.include?.words) {
      row.words = row.words
        .map((word) => ({
          ...clone(word),
          userProgress: state.wordProgress
            .filter((item) => item.lessonWordId === word.id && item.userId === 'user-1')
            .map(clone),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder)
    }
    return row
  }

  const client: ServiceFakePrisma = {
    now,
    calls,
    state,
    async $transaction<T>(callback: (tx: typeof client) => Promise<T>) {
      calls.push('$transaction')
      return callback(client)
    },
    storyCourse: {
      async findUnique(args: { where: { readySlot?: string; id?: string } }) {
        calls.push(`storyCourse.findUnique:${JSON.stringify(args.where)}`)
        const row = args.where.readySlot
          ? state.courses.find((course) => course.readySlot === args.where.readySlot)
          : state.courses.find((course) => course.id === args.where.id)
        return row ? clone(row) : null
      },
      async findMany() {
        throw new Error('runtime must not scan story courses to locate the ready course')
      },
      async findFirst() {
        throw new Error('runtime must not use non-unique course lookup for the ready course')
      },
    },
    storyLesson: {
      async findMany(args: { where: Record<string, unknown>; orderBy?: { order: 'asc' }; include?: Record<string, unknown> }) {
        calls.push(`storyLesson.findMany:${JSON.stringify(args.where)}`)
        if (args.where.status !== 'ready') throw new Error('lessons must be filtered to ready status')
        if (!args.where.courseId) throw new Error('lessons must be scoped to the ready course id')
        return state.lessons
          .filter((lesson) => matchesWhere(lesson as unknown as Record<string, unknown>, args.where))
          .sort((left, right) => left.order - right.order)
          .map((lesson) => attachRelations(lesson, args))
      },
      async findFirst(args: { where: Record<string, unknown>; include?: Record<string, unknown> }) {
        calls.push(`storyLesson.findFirst:${JSON.stringify(args.where)}`)
        if (args.where.status !== 'ready') throw new Error('lesson detail must be filtered to ready status')
        if (!args.where.courseId) throw new Error('lesson detail must be scoped to the ready course id')
        const lesson = state.lessons.find((item) => matchesWhere(item as unknown as Record<string, unknown>, args.where))
        return lesson ? attachRelations(lesson, args) : null
      },
    },
    userStoryProgress: {
      async findUnique(args: { where: { userId_lessonId: { userId: string; lessonId: string } } }) {
        calls.push(`userStoryProgress.findUnique:${JSON.stringify(args.where.userId_lessonId)}`)
        const { userId, lessonId } = args.where.userId_lessonId
        return clone(state.progress.find((item) => item.userId === userId && item.lessonId === lessonId) ?? null)
      },
      async upsert(args: { where: { userId_lessonId: { userId: string; lessonId: string } }; create: ProgressRow; update: Partial<ProgressRow> }) {
        calls.push(`userStoryProgress.upsert:${JSON.stringify(args.where.userId_lessonId)}`)
        const { userId, lessonId } = args.where.userId_lessonId
        const existingIndex = state.progress.findIndex((item) => item.userId === userId && item.lessonId === lessonId)
        if (existingIndex >= 0) {
          state.progress[existingIndex] = { ...state.progress[existingIndex], ...clone(args.update) }
          return clone(state.progress[existingIndex])
        }
        const row = { ...clone(args.create), id: `progress-${state.nextProgress++}` }
        state.progress.push(row)
        return clone(row)
      },
    },
  }

  return client
}

describe('listStoryLessons', () => {
  it('loads ready lessons only from the unique ready-slot course and reports progress plus due counts', async () => {
    const dueAt = new Date('2026-08-20T00:00:00.000Z')
    const futureAt = new Date('2026-08-22T00:00:00.000Z')
    const prisma = createServicePrisma({
      lessons: [
        makeLesson({ id: 'lesson-2', order: 2, title: 'Second Ready', courseId: 'course-ready' }),
        makeLesson({ id: 'lesson-draft', order: 1, title: 'Hidden Draft', courseId: 'course-ready', status: 'draft', contentJson: 'not json' }),
        makeLesson({ id: 'lesson-archived', order: 1, title: 'Archived Lesson', courseId: 'course-archived', status: 'ready', contentJson: 'not json' }),
        makeLesson({ id: 'lesson-1', order: 1, title: 'First Ready', courseId: 'course-ready' }),
      ],
      progress: [
        {
          id: 'progress-1',
          userId: 'user-1',
          lessonId: 'lesson-1',
          currentStep: 4,
          status: 'first_passed',
          step1CompletedAt: new Date('2026-08-19T00:00:00.000Z'),
          step2CompletedAt: new Date('2026-08-19T01:00:00.000Z'),
          step3CompletedAt: new Date('2026-08-19T02:00:00.000Z'),
          completedAt: new Date('2026-08-19T02:00:00.000Z'),
        },
      ],
      wordProgress: [
        { userId: 'user-1', lessonWordId: 'lesson-1-word-1', reviewRoundCompleted: 1, nextReviewAt: dueAt },
        { userId: 'user-1', lessonWordId: 'lesson-1-word-2', reviewRoundCompleted: 2, nextReviewAt: futureAt },
        { userId: 'other-user', lessonWordId: 'lesson-1-word-2', reviewRoundCompleted: 1, nextReviewAt: dueAt },
      ],
    })

    const lessons = await listStoryLessons({ prisma, userId: 'user-1', now: prisma.now })

    expect(lessons.map((lesson) => lesson.id)).toEqual(['lesson-1', 'lesson-2'])
    expect(lessons[0]).toMatchObject({
      order: 1,
      title: 'First Ready',
      sourceChapterStart: '第一章',
      sourceChapterEnd: '第二章',
      targetWordCount: 2,
      status: 'first_passed',
      completedStep: 3,
      currentStep: 4,
      dueReviewCount: 1,
    })
    expect(lessons[1]).toMatchObject({
      status: 'not_started',
      completedStep: 0,
      currentStep: 1,
      dueReviewCount: 0,
    })
    expect(prisma.calls).toContain('storyCourse.findUnique:{"readySlot":"ready"}')
    expect(prisma.calls).toContain('storyLesson.findMany:{"courseId":"course-ready","status":"ready"}')
  })
})

describe('getStoryLesson', () => {
  it('returns parsed content and ordered lesson words only after ready-course visibility filtering', async () => {
    const prisma = createServicePrisma({
      lessons: [
        makeLesson({ id: 'lesson-ready', courseId: 'course-ready', status: 'ready', contentJson: makeContent({ title: 'Visible', order: 1 }) }),
        makeLesson({ id: 'lesson-hidden', courseId: 'course-archived', status: 'ready', contentJson: 'not json' }),
      ],
    })

    const detail = await getStoryLesson({ prisma, userId: 'user-1', lessonId: 'lesson-ready', now: prisma.now })

    expect(detail?.content.title).toBe('Visible')
    expect(detail?.lessonWords.map((item) => item.word.text)).toEqual(['alpha', 'beta'])
    expect(detail?.lessonWords[0]).toMatchObject({
      sortOrder: 1,
      glossCn: '阿尔法',
      meaning: { id: 'meaning-alpha', definitionCn: '阿尔法' },
    })
    expect(detail?.progress).toMatchObject({ status: 'not_started', completedStep: 0, currentStep: 1 })
    await expect(getStoryLesson({ prisma, userId: 'user-1', lessonId: 'lesson-hidden', now: prisma.now })).resolves.toBeNull()
  })
})

describe('saveFirstPassStep', () => {
  it('persists first-pass steps sequentially and preserves completion timestamps on idempotent retries', async () => {
    const prisma = createServicePrisma()

    const afterStep1 = await saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 1, now: new Date('2026-08-21T01:00:00.000Z') })
    const replayStep1 = await saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 1, now: new Date('2026-08-21T01:30:00.000Z') })
    const afterStep2 = await saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 2, now: new Date('2026-08-21T02:00:00.000Z') })
    const afterStep3 = await saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 3, now: new Date('2026-08-21T03:00:00.000Z') })

    expect(afterStep1).toMatchObject({ status: 'learning', completedStep: 1, currentStep: 2 })
    expect(replayStep1.step1CompletedAt).toBe(afterStep1.step1CompletedAt)
    expect(afterStep2).toMatchObject({ status: 'learning', completedStep: 2, currentStep: 3 })
    expect(afterStep3).toMatchObject({ status: 'first_passed', completedStep: 3, currentStep: 4 })
    expect(afterStep3.completedAt).toBe('2026-08-21T03:00:00.000Z')
    expect(prisma.calls.filter((call: string) => call.startsWith('$transaction'))).toHaveLength(4)
    expect(prisma.calls.some((call: string) => call.startsWith('userStoryProgress.upsert'))).toBe(true)
  })

  it('rejects jumping from Step1 straight to Step3', async () => {
    const prisma = createServicePrisma()

    await saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 1, now: new Date('2026-08-21T01:00:00.000Z') })

    await expect(
      saveFirstPassStep({ prisma, userId: 'user-1', lessonId: 'lesson-ready-1', step: 3, now: new Date('2026-08-21T02:00:00.000Z') }),
    ).rejects.toThrow(/Cannot complete Step3 before Step2/)
  })
})