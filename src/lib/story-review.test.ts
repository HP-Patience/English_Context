import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  getDueStoryWords,
  mapStoryResultToGrade,
  submitStoryReview,
} from './story-review'
import { STORY_ERROR_CODES } from './story-errors'

type CourseRow = { id: string; status: string; readySlot: string | null }
type UserStoryProgressRow = {
  userId: string
  lessonId: string
  currentStep: number
  status: string
  step1CompletedAt: Date | null
  step2CompletedAt: Date | null
  step3CompletedAt: Date | null
  completedAt: Date | null
}
type WordRow = { id: string; text: string }
type MeaningRow = { id: string; wordId: string; partOfSpeech: string; definition: string; definitionCn: string | null; example: string | null }
type LessonWordRow = {
  id: string
  lessonId: string
  wordId: string
  meaningId: string
  sortOrder: number
  glossCn: string
  word: WordRow
  meaning: MeaningRow
  userProgress?: UserStoryWordProgressRow[]
  lesson?: LessonRow
}
type LessonRow = {
  id: string
  courseId: string
  order: number
  title: string
  status: string
  words: LessonWordRow[]
  userProgress?: UserStoryProgressRow[]
}
type UserStoryWordProgressRow = {
  id: string
  userId: string
  lessonWordId: string
  reviewRoundCompleted: number
  nextReviewAt: Date | null
  lastResult: string | null
  lastReviewedAt: Date | null
}
type StoryReviewAttemptRow = {
  id: string
  userId: string
  lessonWordId: string
  round: number
  result: string
  createdAt: Date
}
type UserWordRow = {
  id: string
  userId: string
  wordId: string
  status: string
  mastery: number
  bookmarked: boolean
  learnRound: number
  lastRatedAt: Date | null
  createdAt: Date
}
type UserWordMeaningRow = {
  id: string
  userWordId: string
  meaningId: string
  easeFactor: number
  interval: number
  nextReviewAt: Date
  currentTestLevel: number
  mastery: number
  lastRatedAt: Date | null
}

type ReviewState = {
  courses: CourseRow[]
  lessons: LessonRow[]
  lessonProgress: UserStoryProgressRow[]
  wordProgress: UserStoryWordProgressRow[]
  attempts: StoryReviewAttemptRow[]
  userWords: UserWordRow[]
  userWordMeanings: UserWordMeaningRow[]
  nextWordProgress: number
  nextAttempt: number
  nextUserWord: number
  nextUserWordMeaning: number
}


type AttemptCreateConflictHook = (
  args: { data: Omit<StoryReviewAttemptRow, 'id'> },
  state: ReviewState,
  calls: string[],
) => unknown

type CreateReviewPrismaOptions = {
  courses?: CourseRow[]
  lessons?: LessonRow[]
  lessonProgress?: UserStoryProgressRow[]
  wordProgress?: UserStoryWordProgressRow[]
  attempts?: StoryReviewAttemptRow[]
  userWords?: UserWordRow[]
  userWordMeanings?: UserWordMeaningRow[]
  onAttemptCreate?: AttemptCreateConflictHook
}

type ReviewFakePrisma = {
  calls: string[]
  state: ReviewState
  $transaction<T>(callback: (tx: ReviewFakePrisma) => Promise<T>): Promise<T>
  storyCourse: {
    findUnique(args: { where: { readySlot: string } }): Promise<CourseRow | null>
  }
  storyLesson: {
    findMany(args: { where: { courseId?: string; status?: string; id?: string }; orderBy?: unknown; include?: Record<string, unknown> }): Promise<LessonRow[]>
  }
  storyLessonWord: {
    findFirst(args: { where: { id: string; lesson?: { courseId?: string; status?: string } }; include?: Record<string, unknown> }): Promise<LessonWordRow | null>
  }
  userStoryWordProgress: {
    findUnique(args: { where: { userId_lessonWordId: { userId: string; lessonWordId: string } } }): Promise<UserStoryWordProgressRow | null>
    upsert(args: { where: { userId_lessonWordId: { userId: string; lessonWordId: string } }; create: Omit<UserStoryWordProgressRow, 'id'>; update: Partial<UserStoryWordProgressRow> }): Promise<UserStoryWordProgressRow>
  }
  storyReviewAttempt: {
    findUnique(args: { where: { userId_lessonWordId_round: { userId: string; lessonWordId: string; round: number } } }): Promise<StoryReviewAttemptRow | null>
    create(args: { data: Omit<StoryReviewAttemptRow, 'id'> }): Promise<StoryReviewAttemptRow>
  }
  userWord: {
    upsert(args: { where: { userId_wordId: { userId: string; wordId: string } }; create: Omit<UserWordRow, 'id' | 'createdAt'>; update: Partial<UserWordRow> }): Promise<UserWordRow>
    update(args: { where: { id: string }; data: Partial<UserWordRow> }): Promise<UserWordRow>
  }
  userWordMeaning: {
    findFirst(args: { where: { userWordId: string; meaningId?: string } }): Promise<UserWordMeaningRow | null>
    findMany(args: { where: { userWordId: string } }): Promise<UserWordMeaningRow[]>
    create(args: { data: Omit<UserWordMeaningRow, 'id'> }): Promise<UserWordMeaningRow>
    update(args: { where: { id: string }; data: Partial<UserWordMeaningRow> }): Promise<UserWordMeaningRow>
  }
}

const now = new Date('2026-08-21T10:00:00.000Z')
const yesterday = new Date('2026-08-20T10:00:00.000Z')
const tomorrow = new Date('2026-08-22T10:00:00.000Z')

function clone<T>(value: T): T {
  return structuredClone(value)
}

function makeMeaning(id: string, wordId: string, definitionCn: string): MeaningRow {
  return { id, wordId, partOfSpeech: 'n.', definition: definitionCn, definitionCn, example: null }
}

function makeLesson(overrides: Partial<LessonRow> = {}): LessonRow {
  const id = overrides.id ?? 'lesson-ready-1'
  const courseId = overrides.courseId ?? 'course-ready'
  const words = overrides.words ?? [
    makeLessonWord({ id: `${id}-word-1`, lessonId: id, wordId: 'word-alpha', meaningId: 'meaning-alpha', sortOrder: 1, glossCn: '阿尔法' }),
    makeLessonWord({ id: `${id}-word-2`, lessonId: id, wordId: 'word-beta', meaningId: 'meaning-beta', sortOrder: 2, glossCn: '贝塔' }),
  ]
  return {
    id,
    courseId,
    order: 1,
    title: 'Ready Lesson',
    status: 'ready',
    words,
    ...overrides,
  }
}

function makeLessonWord(overrides: Partial<LessonWordRow> & Pick<LessonWordRow, 'id' | 'lessonId' | 'wordId' | 'meaningId' | 'sortOrder' | 'glossCn'>): LessonWordRow {
  const word = { id: overrides.wordId, text: overrides.wordId.replace('word-', '') }
  return {
    ...overrides,
    word,
    meaning: makeMeaning(overrides.meaningId, overrides.wordId, overrides.glossCn),
  }
}

function step3Progress(lessonId = 'lesson-ready-1', userId = 'user-1'): UserStoryProgressRow {
  return {
    userId,
    lessonId,
    currentStep: 4,
    status: 'first_passed',
    step1CompletedAt: new Date('2026-08-19T00:00:00.000Z'),
    step2CompletedAt: new Date('2026-08-19T01:00:00.000Z'),
    step3CompletedAt: new Date('2026-08-19T02:00:00.000Z'),
    completedAt: new Date('2026-08-19T02:00:00.000Z'),
  }
}

function createReviewPrisma({
  courses = [{ id: 'course-ready', status: 'ready', readySlot: 'ready' }] as CourseRow[],
  lessons = [makeLesson()] as LessonRow[],
  lessonProgress = [step3Progress()] as UserStoryProgressRow[],
  wordProgress = [] as UserStoryWordProgressRow[],
  attempts = [] as StoryReviewAttemptRow[],
  userWords = [] as UserWordRow[],
  userWordMeanings = [] as UserWordMeaningRow[],
  onAttemptCreate,
}: CreateReviewPrismaOptions = {}) {
  const state: ReviewState = {
    courses: clone(courses),
    lessons: clone(lessons),
    lessonProgress: clone(lessonProgress),
    wordProgress: clone(wordProgress),
    attempts: clone(attempts),
    userWords: clone(userWords),
    userWordMeanings: clone(userWordMeanings),
    nextWordProgress: 1,
    nextAttempt: 1,
    nextUserWord: 1,
    nextUserWordMeaning: 1,
  }
  const calls: string[] = []

  const attachLessonRelations = (lesson: LessonRow, include?: Record<string, unknown>): LessonRow => {
    const row = clone(lesson)
    if (include?.userProgress) {
      row.userProgress = state.lessonProgress.filter((progress) => progress.lessonId === row.id && progress.userId === 'user-1')
    }
    if (include?.words) {
      row.words = row.words
        .map((word) => ({
          ...clone(word),
          userProgress: state.wordProgress.filter((progress) => progress.lessonWordId === word.id && progress.userId === 'user-1'),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder)
    }
    return row
  }

  const findLessonWord = (id: string, readyCourseId?: string) => {
    for (const lesson of state.lessons) {
      if (readyCourseId && (lesson.courseId !== readyCourseId || lesson.status !== 'ready')) continue
      const word = lesson.words.find((item) => item.id === id)
      if (word) return { lesson, word }
    }
    return null
  }

  const client: ReviewFakePrisma = {
    calls,
    state,
    async $transaction<T>(callback: (tx: ReviewFakePrisma) => Promise<T>) {
      calls.push('$transaction')
      return callback(client)
    },
    storyCourse: {
      async findUnique(args: { where: { readySlot: string } }) {
        calls.push(`storyCourse.findUnique:${JSON.stringify(args.where)}`)
        return clone(state.courses.find((course) => course.readySlot === args.where.readySlot) ?? null)
      },
    },
    storyLesson: {
      async findMany(args: { where: { courseId?: string; status?: string; id?: string }; orderBy?: unknown; include?: Record<string, unknown> }) {
        calls.push(`storyLesson.findMany:${JSON.stringify(args.where)}`)
        if (args.where.courseId !== 'course-ready') throw new Error('must scope due lessons to the ready course')
        if (args.where.status !== 'ready') throw new Error('must scope due lessons to ready status')
        return state.lessons
          .filter((lesson) => lesson.courseId === args.where.courseId && lesson.status === args.where.status && (!args.where.id || lesson.id === args.where.id))
          .sort((left, right) => left.order - right.order)
          .map((lesson) => attachLessonRelations(lesson, args.include))
      },
    },
    storyLessonWord: {
      async findFirst(args: { where: { id: string; lesson?: { courseId?: string; status?: string } }; include?: Record<string, unknown> }) {
        calls.push(`storyLessonWord.findFirst:${JSON.stringify(args.where)}`)
        const match = findLessonWord(args.where.id, args.where.lesson?.courseId)
        if (!match) return null
        const row = clone(match.word)
        if (args.include?.lesson) {
          row.lesson = attachLessonRelations(match.lesson, { userProgress: true })
        }
        row.userProgress = state.wordProgress.filter((progress) => progress.lessonWordId === row.id && progress.userId === 'user-1')
        return row
      },
    },
    userStoryWordProgress: {
      async findUnique(args: { where: { userId_lessonWordId: { userId: string; lessonWordId: string } } }) {
        const { userId, lessonWordId } = args.where.userId_lessonWordId
        return clone(state.wordProgress.find((progress) => progress.userId === userId && progress.lessonWordId === lessonWordId) ?? null)
      },
      async upsert(args: { where: { userId_lessonWordId: { userId: string; lessonWordId: string } }; create: Omit<UserStoryWordProgressRow, 'id'>; update: Partial<UserStoryWordProgressRow> }) {
        calls.push(`userStoryWordProgress.upsert:${JSON.stringify(args.where.userId_lessonWordId)}`)
        const { userId, lessonWordId } = args.where.userId_lessonWordId
        const existingIndex = state.wordProgress.findIndex((progress) => progress.userId === userId && progress.lessonWordId === lessonWordId)
        if (existingIndex >= 0) {
          state.wordProgress[existingIndex] = { ...state.wordProgress[existingIndex], ...clone(args.update) }
          return clone(state.wordProgress[existingIndex])
        }
        const row = { id: `story-word-progress-${state.nextWordProgress++}`, ...clone(args.create) }
        state.wordProgress.push(row)
        return clone(row)
      },
    },
    storyReviewAttempt: {
      async findUnique(args: { where: { userId_lessonWordId_round: { userId: string; lessonWordId: string; round: number } } }) {
        const { userId, lessonWordId, round } = args.where.userId_lessonWordId_round
        return clone(state.attempts.find((attempt) => attempt.userId === userId && attempt.lessonWordId === lessonWordId && attempt.round === round) ?? null)
      },
      async create(args: { data: Omit<StoryReviewAttemptRow, 'id'> }) {
        calls.push(`storyReviewAttempt.create:${JSON.stringify({ userId: args.data.userId, lessonWordId: args.data.lessonWordId, round: args.data.round, result: args.data.result })}`)
        const conflict = onAttemptCreate?.(args, state, calls)
        if (conflict) throw conflict
        if (state.attempts.some((attempt) => attempt.userId === args.data.userId && attempt.lessonWordId === args.data.lessonWordId && attempt.round === args.data.round)) {
          throw new Error('Unique constraint failed on StoryReviewAttempt')
        }
        const row = { id: `attempt-${state.nextAttempt++}`, ...clone(args.data) }
        state.attempts.push(row)
        return clone(row)
      },
    },
    userWord: {
      async upsert(args: { where: { userId_wordId: { userId: string; wordId: string } }; create: Omit<UserWordRow, 'id' | 'createdAt'>; update: Partial<UserWordRow> }) {
        calls.push(`userWord.upsert:${JSON.stringify(args.where.userId_wordId)}`)
        const { userId, wordId } = args.where.userId_wordId
        const existing = state.userWords.find((row) => row.userId === userId && row.wordId === wordId)
        if (existing) return clone(existing)
        const row = { id: `user-word-${state.nextUserWord++}`, createdAt: now, ...clone(args.create) }
        state.userWords.push(row)
        return clone(row)
      },
      async update(args: { where: { id: string }; data: Partial<UserWordRow> }) {
        calls.push(`userWord.update:${args.where.id}`)
        const index = state.userWords.findIndex((row) => row.id === args.where.id)
        if (index < 0) throw new Error('UserWord not found')
        state.userWords[index] = { ...state.userWords[index], ...clone(args.data) }
        return clone(state.userWords[index])
      },
    },
    userWordMeaning: {
      async findFirst(args: { where: { userWordId: string; meaningId?: string } }) {
        return clone(state.userWordMeanings.find((row) => row.userWordId === args.where.userWordId && (!args.where.meaningId || row.meaningId === args.where.meaningId)) ?? null)
      },
      async findMany(args: { where: { userWordId: string } }) {
        return clone(state.userWordMeanings.filter((row) => row.userWordId === args.where.userWordId))
      },
      async create(args: { data: Omit<UserWordMeaningRow, 'id'> }) {
        calls.push(`userWordMeaning.create:${args.data.meaningId}`)
        const row = { id: `user-word-meaning-${state.nextUserWordMeaning++}`, ...clone(args.data) }
        state.userWordMeanings.push(row)
        return clone(row)
      },
      async update(args: { where: { id: string }; data: Partial<UserWordMeaningRow> }) {
        calls.push(`userWordMeaning.update:${args.where.id}`)
        const index = state.userWordMeanings.findIndex((row) => row.id === args.where.id)
        if (index < 0) throw new Error('UserWordMeaning not found')
        state.userWordMeanings[index] = { ...state.userWordMeanings[index], ...clone(args.data) }
        return clone(state.userWordMeanings[index])
      },
    },
  }

  return client
}

function prismaKnownRequestError(code: 'P2002' | 'P2034', message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: Prisma.prismaVersion.client,
  })
}

describe('mapStoryResultToGrade', () => {
  it('maps story recall outcomes onto the exact SM-2 grades', () => {
    expect(mapStoryResultToGrade('forgotten')).toBe(0)
    expect(mapStoryResultToGrade('vague')).toBe(2)
    expect(mapStoryResultToGrade('remembered')).toBe(4)
  })
})

describe('getDueStoryWords', () => {
  it('returns only due words from ready lessons in the ready-slot course after Step3', async () => {
    const readyLesson = makeLesson({ id: 'lesson-ready-1', order: 1, courseId: 'course-ready', status: 'ready' })
    const futureLesson = makeLesson({ id: 'lesson-ready-2', order: 2, courseId: 'course-ready', status: 'ready' })
    const unpassedLesson = makeLesson({ id: 'lesson-unpassed', order: 3, courseId: 'course-ready', status: 'ready' })
    const draftLesson = makeLesson({ id: 'lesson-draft', order: 4, courseId: 'course-ready', status: 'draft' })
    const archivedCourseLesson = makeLesson({ id: 'lesson-archived-course', order: 1, courseId: 'course-archived', status: 'ready' })
    const prisma = createReviewPrisma({
      lessons: [futureLesson, draftLesson, archivedCourseLesson, unpassedLesson, readyLesson],
      lessonProgress: [step3Progress('lesson-ready-1'), step3Progress('lesson-ready-2')],
      wordProgress: [
        { id: 'progress-future', userId: 'user-1', lessonWordId: 'lesson-ready-2-word-1', reviewRoundCompleted: 1, nextReviewAt: tomorrow, lastResult: 'remembered', lastReviewedAt: now },
        { id: 'progress-round5', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-2', reviewRoundCompleted: 5, nextReviewAt: null, lastResult: 'remembered', lastReviewedAt: now },
      ],
    })

    const due = await getDueStoryWords({ prisma, userId: 'user-1', now })

    expect(due.map((word) => word.lessonWordId)).toEqual(['lesson-ready-1-word-1', 'lesson-ready-2-word-2'])
    expect(due[0]).toMatchObject({ lessonId: 'lesson-ready-1', lessonOrder: 1, word: 'alpha', glossCn: '阿尔法', dueRound: 1, roundCompleted: 0 })
    expect(due[1]).toMatchObject({ lessonId: 'lesson-ready-2', lessonOrder: 2, dueRound: 1, roundCompleted: 0 })
  })

  it('sorts due words by lesson order, due time, and word order with first-pass words placed earliest within a lesson', async () => {
    const lessonOne = makeLesson({
      id: 'lesson-ready-1',
      order: 1,
      words: [
        makeLessonWord({ id: 'lesson-ready-1-word-1', lessonId: 'lesson-ready-1', wordId: 'word-alpha', meaningId: 'meaning-alpha', sortOrder: 1, glossCn: '阿尔法' }),
        makeLessonWord({ id: 'lesson-ready-1-word-2', lessonId: 'lesson-ready-1', wordId: 'word-beta', meaningId: 'meaning-beta', sortOrder: 2, glossCn: '贝塔' }),
        makeLessonWord({ id: 'lesson-ready-1-word-3', lessonId: 'lesson-ready-1', wordId: 'word-gamma', meaningId: 'meaning-gamma', sortOrder: 3, glossCn: '伽马' }),
      ],
    })
    const lessonTwo = makeLesson({ id: 'lesson-ready-2', order: 2 })
    const prisma = createReviewPrisma({
      lessons: [lessonTwo, lessonOne],
      lessonProgress: [step3Progress('lesson-ready-1'), step3Progress('lesson-ready-2')],
      wordProgress: [
        { id: 'progress-lesson-one-later', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', reviewRoundCompleted: 1, nextReviewAt: now, lastResult: 'remembered', lastReviewedAt: yesterday },
        { id: 'progress-lesson-one-earlier', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-3', reviewRoundCompleted: 1, nextReviewAt: yesterday, lastResult: 'remembered', lastReviewedAt: yesterday },
        { id: 'progress-lesson-two-earliest', userId: 'user-1', lessonWordId: 'lesson-ready-2-word-1', reviewRoundCompleted: 1, nextReviewAt: new Date('2026-08-19T10:00:00.000Z'), lastResult: 'remembered', lastReviewedAt: yesterday },
      ],
    })

    const due = await getDueStoryWords({ prisma, userId: 'user-1', now })

    expect(due.map((word) => word.lessonWordId)).toEqual([
      'lesson-ready-1-word-2',
      'lesson-ready-1-word-3',
      'lesson-ready-1-word-1',
      'lesson-ready-2-word-2',
      'lesson-ready-2-word-1',
    ])
    expect(due[0]).toMatchObject({ dueRound: 1, roundCompleted: 0, nextReviewAt: null })
  })

  it('keeps an optional lesson filter inside the ready-slot course', async () => {
    const prisma = createReviewPrisma({
      lessons: [
        makeLesson({ id: 'lesson-ready-1', courseId: 'course-ready', status: 'ready' }),
        makeLesson({ id: 'lesson-archived-course', courseId: 'course-archived', status: 'ready' }),
      ],
      lessonProgress: [step3Progress('lesson-ready-1'), step3Progress('lesson-archived-course')],
    })

    await expect(getDueStoryWords({ prisma, userId: 'user-1', lessonId: 'lesson-archived-course', now })).resolves.toEqual([])
  })
})

describe('submitStoryReview', () => {
  it('creates round 1 for a first-passed lesson word without requiring all five rounds today', async () => {
    const prisma = createReviewPrisma()

    const result = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now })

    expect(result).toMatchObject({ round: 1, roundCompleted: 1, grade: 4, userWordMeaningMastery: 63, userWordMastery: 63 })
    expect(result.nextReviewAt?.toISOString()).toBe('2026-08-22T10:00:00.000Z')
    expect(prisma.state.wordProgress.find((row) => row.lessonWordId === 'lesson-ready-1-word-1')).toMatchObject({ reviewRoundCompleted: 1, lastResult: 'remembered' })
    expect(prisma.state.attempts).toHaveLength(1)
    expect(prisma.state.attempts[0]).toMatchObject({ round: 1, result: 'remembered' })
  })

  it('advances a due round 4 item to round 5 and never creates round 6', async () => {
    const prisma = createReviewPrisma({
      wordProgress: [
        { id: 'progress-round4', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', reviewRoundCompleted: 4, nextReviewAt: yesterday, lastResult: 'remembered', lastReviewedAt: yesterday },
      ],
      userWords: [
        { id: 'uw-alpha', userId: 'user-1', wordId: 'word-alpha', status: 'reviewing', mastery: 70, bookmarked: false, learnRound: 0, lastRatedAt: yesterday, createdAt: yesterday },
      ],
      userWordMeanings: [
        { id: 'uwm-alpha', userWordId: 'uw-alpha', meaningId: 'meaning-alpha', easeFactor: 2.5, interval: 6, nextReviewAt: yesterday, currentTestLevel: 0, mastery: 70, lastRatedAt: yesterday },
      ],
    })

    const round5 = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now })
    await expect(submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now })).resolves.toMatchObject({ round: 5, roundCompleted: 5 })

    expect(round5.round).toBe(5)
    expect(round5.roundCompleted).toBe(5)
    expect(round5.nextReviewAt).toBeNull()
    expect(prisma.state.attempts.map((attempt) => attempt.round)).toEqual([5])
  })

  it('treats duplicate same-round retries as idempotent instead of mutating progress twice', async () => {
    const prisma = createReviewPrisma()

    const first = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'vague', now })
    const retry = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'vague', now })

    expect(retry).toMatchObject({ round: first.round, roundCompleted: first.roundCompleted, grade: 2 })
    expect(prisma.state.attempts).toHaveLength(1)
    expect(prisma.state.wordProgress.find((row) => row.lessonWordId === 'lesson-ready-1-word-1')?.reviewRoundCompleted).toBe(1)
  })

  it('uses the immutable-round conflict code for a duplicate retry with a different result', async () => {
    const prisma = createReviewPrisma()

    await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'vague', now })

    await expect(
      submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'forgotten', now }),
    ).rejects.toMatchObject({ code: STORY_ERROR_CODES.REVIEW_RESULT_CONFLICT })
    expect(prisma.state.attempts).toHaveLength(1)
  })

  it('returns the committed attempt when a concurrent duplicate wins the same round without double-applying SM-2', async () => {
    let injectedConflict = false
    const prisma = createReviewPrisma({
      userWords: [
        { id: 'uw-alpha', userId: 'user-1', wordId: 'word-alpha', status: 'reviewing', mastery: 0, bookmarked: false, learnRound: 0, lastRatedAt: null, createdAt: yesterday },
      ],
      userWordMeanings: [
        { id: 'uwm-alpha', userWordId: 'uw-alpha', meaningId: 'meaning-alpha', easeFactor: 2.5, interval: 0, nextReviewAt: yesterday, currentTestLevel: 0, mastery: 0, lastRatedAt: null },
      ],
      onAttemptCreate(args, state) {
        if (injectedConflict) return null
        injectedConflict = true
        state.attempts.push({ id: 'attempt-winner', ...clone(args.data) })
        state.wordProgress.push({
          id: 'progress-winner',
          userId: args.data.userId,
          lessonWordId: args.data.lessonWordId,
          reviewRoundCompleted: args.data.round,
          nextReviewAt: tomorrow,
          lastResult: args.data.result,
          lastReviewedAt: args.data.createdAt,
        })
        state.userWordMeanings[0] = {
          ...state.userWordMeanings[0],
          easeFactor: 2.3,
          interval: 1,
          nextReviewAt: tomorrow,
          mastery: 57,
          lastRatedAt: args.data.createdAt,
        }
        state.userWords[0] = {
          ...state.userWords[0],
          mastery: 57,
          lastRatedAt: args.data.createdAt,
        }
        return prismaKnownRequestError('P2002', 'Unique constraint failed on StoryReviewAttempt')
      },
    })

    const result = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'vague', now })

    expect(result).toMatchObject({ round: 1, roundCompleted: 1, grade: 2, userWordMeaningMastery: 57, userWordMastery: 57 })
    expect(result.nextReviewAt?.toISOString()).toBe(tomorrow.toISOString())
    expect(prisma.state.attempts).toHaveLength(1)
    expect(prisma.state.userWordMeanings.find((row) => row.id === 'uwm-alpha')).toMatchObject({ interval: 1, mastery: 57 })
    expect(prisma.calls.filter((call) => call.startsWith('userWordMeaning.update'))).toHaveLength(0)
  })

  it('uses a stable conflict code when retryable review conflicts are exhausted', async () => {
    let conflictCount = 0
    const prisma = createReviewPrisma({
      onAttemptCreate() {
        conflictCount += 1
        return prismaKnownRequestError('P2034', 'Transaction failed due to a write conflict')
      },
    })

    await expect(
      submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now }),
    ).rejects.toMatchObject({ code: STORY_ERROR_CODES.REVIEW_RETRY_EXHAUSTED })
    expect(conflictCount).toBe(3)
  })

  it.each([
    ['message lookalike', new Error('transaction conflict while proxying a request')],
    ['plain P2002-shaped object', { code: 'P2002', message: 'Unique constraint failed' }],
    ['plain P2034-shaped object', { code: 'P2034', message: 'Transaction failed due to a write conflict' }],
  ])('does not retry an untrusted %s', async (_label, infrastructureError) => {
    let attemptCount = 0
    const prisma = createReviewPrisma({
      onAttemptCreate() {
        attemptCount += 1
        return infrastructureError
      },
    })

    await expect(
      submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now }),
    ).rejects.toBe(infrastructureError)
    expect(attemptCount).toBe(1)
  })

  it('rejects lesson words outside the current ready course or before Step3', async () => {
    const prisma = createReviewPrisma({
      lessons: [
        makeLesson({ id: 'lesson-ready-1', courseId: 'course-ready', status: 'ready' }),
        makeLesson({ id: 'lesson-unpassed', courseId: 'course-ready', status: 'ready' }),
        makeLesson({ id: 'lesson-archived-course', courseId: 'course-archived', status: 'ready' }),
      ],
      lessonProgress: [step3Progress('lesson-ready-1'), step3Progress('lesson-archived-course')],
    })

    await expect(submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-archived-course-word-1', result: 'remembered', now })).rejects.toMatchObject({
      code: STORY_ERROR_CODES.LESSON_WORD_NOT_FOUND,
      message: expect.stringMatching(/not in the current ready story course/),
    })
    await expect(submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-unpassed-word-1', result: 'remembered', now })).rejects.toMatchObject({
      code: STORY_ERROR_CODES.LESSON_WORD_NOT_REVIEWABLE,
      message: expect.stringMatching(/Step3/),
    })
  })

  it('rejects a conflicting current-round submission and leaves the existing round intact', async () => {
    const prisma = createReviewPrisma({
      wordProgress: [
        { id: 'progress-round1', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', reviewRoundCompleted: 1, nextReviewAt: tomorrow, lastResult: 'vague', lastReviewedAt: yesterday },
      ],
      attempts: [
        { id: 'attempt-1', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', round: 1, result: 'vague', createdAt: yesterday },
      ],
    })

    await expect(submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'remembered', now })).rejects.toMatchObject({
      code: STORY_ERROR_CODES.REVIEW_RESULT_CONFLICT,
      message: expect.stringMatching(/different result/),
    })

    expect(prisma.state.attempts).toHaveLength(1)
    expect(prisma.state.wordProgress[0]?.reviewRoundCompleted).toBe(1)
  })

  it('resets only the forgotten word SM-2 interval without resetting other lesson word progress', async () => {
    const prisma = createReviewPrisma({
      wordProgress: [
        { id: 'progress-alpha', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', reviewRoundCompleted: 2, nextReviewAt: yesterday, lastResult: 'remembered', lastReviewedAt: yesterday },
        { id: 'progress-beta', userId: 'user-1', lessonWordId: 'lesson-ready-1-word-2', reviewRoundCompleted: 3, nextReviewAt: tomorrow, lastResult: 'remembered', lastReviewedAt: yesterday },
      ],
      userWords: [
        { id: 'uw-alpha', userId: 'user-1', wordId: 'word-alpha', status: 'reviewing', mastery: 80, bookmarked: false, learnRound: 0, lastRatedAt: yesterday, createdAt: yesterday },
        { id: 'uw-beta', userId: 'user-1', wordId: 'word-beta', status: 'reviewing', mastery: 90, bookmarked: false, learnRound: 0, lastRatedAt: yesterday, createdAt: yesterday },
      ],
      userWordMeanings: [
        { id: 'uwm-alpha', userWordId: 'uw-alpha', meaningId: 'meaning-alpha', easeFactor: 2.5, interval: 30, nextReviewAt: yesterday, currentTestLevel: 0, mastery: 80, lastRatedAt: yesterday },
        { id: 'uwm-beta', userWordId: 'uw-beta', meaningId: 'meaning-beta', easeFactor: 2.5, interval: 30, nextReviewAt: tomorrow, currentTestLevel: 0, mastery: 90, lastRatedAt: yesterday },
      ],
    })

    const result = await submitStoryReview({ prisma, userId: 'user-1', lessonWordId: 'lesson-ready-1-word-1', result: 'forgotten', now })

    expect(result).toMatchObject({ round: 3, roundCompleted: 3, grade: 0 })
    expect(prisma.state.userWordMeanings.find((row) => row.id === 'uwm-alpha')).toMatchObject({ interval: 1, mastery: 57 })
    expect(prisma.state.wordProgress.find((row) => row.id === 'progress-alpha')).toMatchObject({ reviewRoundCompleted: 3, lastResult: 'forgotten' })
    expect(prisma.state.userWordMeanings.find((row) => row.id === 'uwm-beta')).toMatchObject({ interval: 30, mastery: 90 })
    expect(prisma.state.wordProgress.find((row) => row.id === 'progress-beta')).toMatchObject({ reviewRoundCompleted: 3, lastResult: 'remembered' })
  })
})
