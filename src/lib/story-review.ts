import { calculateSM2 } from './sm2'

const READY_COURSE_SLOT = 'ready'
const READY_STATUS = 'ready'
const MAX_STORY_REVIEW_ROUND = 5

export type StoryReviewSubmissionResult = 'remembered' | 'vague' | 'forgotten'

export type DueStoryWord = {
  lessonWordId: string
  lessonId: string
  lessonOrder: number
  lessonTitle: string
  sortOrder: number
  wordId: string
  meaningId: string
  word: string
  glossCn: string
  definitionCn: string | null
  dueRound: number
  roundCompleted: number
  nextReviewAt: string | null
}

export type StoryReviewResult = {
  lessonWordId: string
  round: number
  roundCompleted: number
  nextReviewAt: Date | null
  grade: 0 | 2 | 4
  userWordMeaningMastery: number
  userWordMastery: number
}

type StoryReviewParams = {
  prisma: unknown
  userId: string
  now?: Date
}

type ReadyCourseRow = {
  id: string
  status: string
  readySlot: string | null
}

type UserStoryProgressRow = {
  userId: string
  lessonId: string
  step3CompletedAt: Date | string | null
}

type UserStoryWordProgressRow = {
  id?: string
  userId: string
  lessonWordId: string
  reviewRoundCompleted: number
  nextReviewAt: Date | string | null
  lastResult: string | null
  lastReviewedAt: Date | string | null
}

type StoryReviewAttemptRow = {
  id?: string
  userId: string
  lessonWordId: string
  round: number
  result: string
  createdAt: Date | string
}

type WordRow = { id: string; text: string }
type MeaningRow = {
  id: string
  partOfSpeech?: string | null
  definition?: string | null
  definitionCn?: string | null
  example?: string | null
}

type LessonWordRow = {
  id: string
  lessonId: string
  wordId: string
  meaningId: string
  sortOrder: number
  glossCn: string
  word: WordRow
  meaning: MeaningRow
  lesson?: LessonRow
  userProgress?: UserStoryWordProgressRow[]
}

type LessonRow = {
  id: string
  courseId: string
  order: number
  title: string
  status: string
  words?: LessonWordRow[]
  userProgress?: UserStoryProgressRow[]
}

type UserWordRow = {
  id: string
  userId: string
  wordId: string
  status: string
  mastery: number
  bookmarked?: boolean
  learnRound?: number
  lastRatedAt: Date | string | null
  createdAt?: Date | string
}

type UserWordMeaningRow = {
  id: string
  userWordId: string
  meaningId: string
  easeFactor: number
  interval: number
  nextReviewAt: Date | string
  currentTestLevel?: number
  mastery: number
  lastRatedAt: Date | string | null
}

type InternalPrismaClient = {
  $transaction<T>(callback: (tx: InternalPrismaClient) => Promise<T>, options?: unknown): Promise<T>
  storyCourse: {
    findUnique(args: unknown): Promise<unknown>
  }
  storyLesson: {
    findMany(args: unknown): Promise<unknown[]>
  }
  storyLessonWord: {
    findFirst(args: unknown): Promise<unknown>
  }
  userStoryWordProgress: {
    findUnique(args: unknown): Promise<unknown>
    upsert(args: unknown): Promise<unknown>
  }
  storyReviewAttempt: {
    findUnique(args: unknown): Promise<unknown>
    create(args: unknown): Promise<unknown>
  }
  userWord: {
    upsert(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
  userWordMeaning: {
    findFirst(args: unknown): Promise<unknown>
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
}

export function mapStoryResultToGrade(result: StoryReviewSubmissionResult): 0 | 2 | 4 {
  if (result === 'forgotten') return 0
  if (result === 'vague') return 2
  if (result === 'remembered') return 4
  throw new Error(`Invalid story review result: ${String(result)}`)
}

export async function getDueStoryWords({
  prisma,
  userId,
  lessonId,
  now = new Date(),
}: StoryReviewParams & { lessonId?: string }): Promise<DueStoryWord[]> {
  const client = asPrisma(prisma)
  const course = await findReadyCourse(client)
  if (!course) return []

  const lessons = (await client.storyLesson.findMany({
    where: {
      courseId: course.id,
      status: READY_STATUS,
      ...(lessonId ? { id: lessonId } : {}),
    },
    orderBy: { order: 'asc' },
    include: {
      userProgress: { where: { userId }, take: 1 },
      words: {
        orderBy: { sortOrder: 'asc' },
        include: {
          word: true,
          meaning: true,
          userProgress: { where: { userId }, take: 1 },
        },
      },
    },
  })).map(asLessonRow)

  const due: DueStoryWord[] = []
  for (const lesson of lessons) {
    const lessonProgress = firstLessonProgress(lesson)
    if (!lessonProgress?.step3CompletedAt) continue

    for (const lessonWord of orderedLessonWords(lesson)) {
      const progress = firstWordProgress(lessonWord, userId)
      if (!isDueProgress(progress, now)) continue
      due.push(toDueStoryWord(lesson, lessonWord, progress))
    }
  }
  return due.sort(compareDueStoryWords)
}

export async function submitStoryReview({
  prisma,
  userId,
  lessonWordId,
  result,
  now = new Date(),
}: StoryReviewParams & { lessonWordId: string; result: StoryReviewSubmissionResult }): Promise<StoryReviewResult> {
  const client = asPrisma(prisma)
  const grade = mapStoryResultToGrade(result)
  let lastConflict: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await submitStoryReviewOnce({ client, userId, lessonWordId, result, grade, now })
    } catch (error) {
      if (!isRetryableStoryReviewConflict(error)) throw error
      lastConflict = error
      const committed = await reloadCommittedStoryReviewResult({ client, userId, lessonWordId, result, grade })
      if (committed) return committed
    }
  }

  throw lastConflict instanceof Error ? lastConflict : new Error('Story review submission conflicted and could not be reloaded')
}

async function submitStoryReviewOnce({
  client,
  userId,
  lessonWordId,
  result,
  grade,
  now,
}: {
  client: InternalPrismaClient
  userId: string
  lessonWordId: string
  result: StoryReviewSubmissionResult
  grade: 0 | 2 | 4
  now: Date
}): Promise<StoryReviewResult> {
  return client.$transaction(async (tx) => {
    const course = await findReadyCourse(tx)
    if (!course) throw new Error('No ready story course is published')

    const lessonWord = await findReadyLessonWordForReview(tx, userId, lessonWordId, course.id)

    const currentProgress = asWordProgressRowOrNull(await tx.userStoryWordProgress.findUnique({
      where: { userId_lessonWordId: { userId, lessonWordId } },
    })) ?? firstWordProgress(lessonWord, userId)

    const isDue = isDueProgress(currentProgress, now)
    if (!isDue) {
      const duplicate = await duplicateCurrentRound(tx, userId, lessonWordId, currentProgress, result)
      if (duplicate) {
        return duplicateReviewResult({
          tx,
          userId,
          lessonWord,
          progress: currentProgress,
          grade,
        })
      }
      throw new Error(`Story lesson word is not due for review: ${lessonWordId}`)
    }

    const round = (currentProgress?.reviewRoundCompleted ?? 0) + 1
    if (round > MAX_STORY_REVIEW_ROUND) {
      throw new Error(`Story lesson word already completed all ${MAX_STORY_REVIEW_ROUND} review rounds: ${lessonWordId}`)
    }

    const userWord = asUserWordRow(await tx.userWord.upsert({
      where: { userId_wordId: { userId, wordId: lessonWord.wordId } },
      create: {
        userId,
        wordId: lessonWord.wordId,
        status: 'reviewing',
        mastery: 0,
        bookmarked: false,
        learnRound: 0,
        lastRatedAt: null,
      },
      update: {},
    }))
    const previousMeaning = await findOrCreateUserWordMeaning(tx, userWord.id, lessonWord.meaningId, now)
    const sm2 = calculateSM2(previousMeaning.easeFactor, previousMeaning.interval, grade, now)
    const userWordMeaningMastery = masteryFromEaseFactor(sm2.easeFactor)

    await tx.storyReviewAttempt.create({
      data: { userId, lessonWordId, round, result, createdAt: now },
    })

    const roundCompleted = round
    const nextReviewAt = roundCompleted >= MAX_STORY_REVIEW_ROUND ? null : sm2.nextReviewAt
    await tx.userStoryWordProgress.upsert({
      where: { userId_lessonWordId: { userId, lessonWordId } },
      create: {
        userId,
        lessonWordId,
        reviewRoundCompleted: roundCompleted,
        nextReviewAt,
        lastResult: result,
        lastReviewedAt: now,
      },
      update: {
        reviewRoundCompleted: roundCompleted,
        nextReviewAt,
        lastResult: result,
        lastReviewedAt: now,
      },
    })

    await tx.userWordMeaning.update({
      where: { id: previousMeaning.id },
      data: {
        easeFactor: sm2.easeFactor,
        interval: sm2.interval,
        nextReviewAt: sm2.nextReviewAt,
        mastery: userWordMeaningMastery,
        lastRatedAt: now,
      },
    })

    const refreshedMeanings = (await tx.userWordMeaning.findMany({
      where: { userWordId: userWord.id },
    })).map(asUserWordMeaningRow)
    const allMeanings = refreshedMeanings.some((meaning) => meaning.id === previousMeaning.id)
      ? refreshedMeanings
      : [{ ...previousMeaning, easeFactor: sm2.easeFactor, interval: sm2.interval, nextReviewAt: sm2.nextReviewAt, mastery: userWordMeaningMastery, lastRatedAt: now }, ...refreshedMeanings]
    const userWordMastery = averageMastery(allMeanings)

    await tx.userWord.update({
      where: { id: userWord.id },
      data: {
        mastery: userWordMastery,
        lastRatedAt: now,
        ...(sm2.interval >= 30 ? { status: 'mastered' } : {}),
      },
    })

    return {
      lessonWordId,
      round,
      roundCompleted,
      nextReviewAt,
      grade,
      userWordMeaningMastery,
      userWordMastery,
    }
  }, { isolationLevel: 'Serializable' })
}

async function reloadCommittedStoryReviewResult({
  client,
  userId,
  lessonWordId,
  result,
  grade,
}: {
  client: InternalPrismaClient
  userId: string
  lessonWordId: string
  result: StoryReviewSubmissionResult
  grade: 0 | 2 | 4
}): Promise<StoryReviewResult | null> {
  const course = await findReadyCourse(client)
  if (!course) throw new Error('No ready story course is published')

  const lessonWord = await findReadyLessonWordForReview(client, userId, lessonWordId, course.id)
  const progress = asWordProgressRowOrNull(await client.userStoryWordProgress.findUnique({
    where: { userId_lessonWordId: { userId, lessonWordId } },
  })) ?? firstWordProgress(lessonWord, userId)
  if (!progress || progress.reviewRoundCompleted < 1) return null

  const attempt = asStoryReviewAttemptRowOrNull(await client.storyReviewAttempt.findUnique({
    where: { userId_lessonWordId_round: { userId, lessonWordId, round: progress.reviewRoundCompleted } },
  }))
  if (!attempt) return null
  if (attempt.result !== result) {
    throw new Error(`Story review round ${attempt.round} was already committed with a different result`)
  }

  return duplicateReviewResult({ tx: client, userId, lessonWord, progress, grade })
}

async function findReadyLessonWordForReview(
  client: InternalPrismaClient,
  userId: string,
  lessonWordId: string,
  readyCourseId: string,
): Promise<LessonWordRow> {
  const lessonWord = asLessonWordRowOrNull(await client.storyLessonWord.findFirst({
    where: {
      id: lessonWordId,
      lesson: { courseId: readyCourseId, status: READY_STATUS },
    },
    include: {
      word: true,
      meaning: true,
      userProgress: { where: { userId }, take: 1 },
      lesson: {
        include: { userProgress: { where: { userId }, take: 1 } },
      },
    },
  }))
  if (!lessonWord) {
    throw new Error(`Story lesson word is not in the current ready story course: ${lessonWordId}`)
  }
  if (!firstLessonProgress(lessonWord.lesson)?.step3CompletedAt) {
    throw new Error(`Cannot review story lesson word before Step3 is completed: ${lessonWordId}`)
  }
  return lessonWord
}

function isRetryableStoryReviewConflict(error: unknown): boolean {
  const maybeCode = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  if (maybeCode === 'P2002' || maybeCode === 'P2034' || maybeCode === '40001') return true

  const message = error instanceof Error ? error.message : String(error)
  return /unique constraint|serializable|serialization|write conflict|transaction conflict|deadlock/i.test(message)
}


function compareDueStoryWords(left: DueStoryWord, right: DueStoryWord): number {
  return (left.lessonOrder - right.lessonOrder)
    || (dueSortTime(left) - dueSortTime(right))
    || (left.sortOrder - right.sortOrder)
    || left.lessonWordId.localeCompare(right.lessonWordId)
}

function dueSortTime(word: DueStoryWord): number {
  // First-pass words without UserStoryWordProgress have no due timestamp; place them
  // at a deterministic earliest point within their lesson before dated review rounds.
  return word.nextReviewAt ? new Date(word.nextReviewAt).getTime() : Number.NEGATIVE_INFINITY
}

async function findReadyCourse(prisma: InternalPrismaClient): Promise<ReadyCourseRow | null> {
  const row = await prisma.storyCourse.findUnique({ where: { readySlot: READY_COURSE_SLOT } })
  if (!row) return null
  const course = asReadyCourseRow(row)
  if (course.status !== READY_STATUS || course.readySlot !== READY_COURSE_SLOT) {
    throw new Error(`publication invariant violated: course ${course.id} occupies the ready slot with status ${course.status}`)
  }
  return course
}

function orderedLessonWords(lesson: LessonRow): LessonWordRow[] {
  return [...(lesson.words ?? [])].sort((left, right) => left.sortOrder - right.sortOrder)
}

function firstLessonProgress(lesson: LessonRow | undefined): UserStoryProgressRow | null {
  return lesson?.userProgress?.[0] ?? null
}

function firstWordProgress(lessonWord: LessonWordRow, userId: string): UserStoryWordProgressRow | null {
  return lessonWord.userProgress?.find((progress) => progress.userId === userId) ?? null
}

function isDueProgress(progress: UserStoryWordProgressRow | null, now: Date): boolean {
  if (!progress) return true
  if (progress.reviewRoundCompleted >= MAX_STORY_REVIEW_ROUND) return false
  if (!progress.nextReviewAt) return true
  return new Date(progress.nextReviewAt) <= now
}

function toDueStoryWord(lesson: LessonRow, lessonWord: LessonWordRow, progress: UserStoryWordProgressRow | null): DueStoryWord {
  const roundCompleted = progress?.reviewRoundCompleted ?? 0
  return {
    lessonWordId: lessonWord.id,
    lessonId: lesson.id,
    lessonOrder: lesson.order,
    lessonTitle: lesson.title,
    sortOrder: lessonWord.sortOrder,
    wordId: lessonWord.wordId,
    meaningId: lessonWord.meaningId,
    word: lessonWord.word.text,
    glossCn: lessonWord.glossCn,
    definitionCn: lessonWord.meaning.definitionCn ?? null,
    dueRound: roundCompleted + 1,
    roundCompleted,
    nextReviewAt: toIso(progress?.nextReviewAt ?? null),
  }
}

async function duplicateCurrentRound(
  tx: InternalPrismaClient,
  userId: string,
  lessonWordId: string,
  progress: UserStoryWordProgressRow | null,
  result: StoryReviewSubmissionResult,
): Promise<StoryReviewAttemptRow | null> {
  const completedRound = progress?.reviewRoundCompleted ?? 0
  if (completedRound < 1) return null
  const attempt = asStoryReviewAttemptRowOrNull(await tx.storyReviewAttempt.findUnique({
    where: { userId_lessonWordId_round: { userId, lessonWordId, round: completedRound } },
  }))
  if (!attempt || attempt.result !== result) return null
  return attempt
}

async function duplicateReviewResult({
  tx,
  userId,
  lessonWord,
  progress,
  grade,
}: {
  tx: InternalPrismaClient
  userId: string
  lessonWord: LessonWordRow
  progress: UserStoryWordProgressRow | null
  grade: 0 | 2 | 4
}): Promise<StoryReviewResult> {
  if (!progress) throw new Error('Cannot build a duplicate story review result without progress')
  const userWord = asUserWordRow(await tx.userWord.upsert({
    where: { userId_wordId: { userId, wordId: lessonWord.wordId } },
    create: {
      userId,
      wordId: lessonWord.wordId,
      status: 'reviewing',
      mastery: 0,
      bookmarked: false,
      learnRound: 0,
      lastRatedAt: null,
    },
    update: {},
  }))
  const meaning = await findOrCreateUserWordMeaning(tx, userWord.id, lessonWord.meaningId, new Date(progress.lastReviewedAt ?? new Date()))
  return {
    lessonWordId: lessonWord.id,
    round: progress.reviewRoundCompleted,
    roundCompleted: progress.reviewRoundCompleted,
    nextReviewAt: progress.reviewRoundCompleted >= MAX_STORY_REVIEW_ROUND ? null : toDateOrNull(progress.nextReviewAt),
    grade,
    userWordMeaningMastery: meaning.mastery,
    userWordMastery: userWord.mastery,
  }
}

async function findOrCreateUserWordMeaning(
  tx: InternalPrismaClient,
  userWordId: string,
  meaningId: string,
  now: Date,
): Promise<UserWordMeaningRow> {
  const existing = asUserWordMeaningRowOrNull(await tx.userWordMeaning.findFirst({
    where: { userWordId, meaningId },
  }))
  if (existing) return existing
  return asUserWordMeaningRow(await tx.userWordMeaning.create({
    data: {
      userWordId,
      meaningId,
      easeFactor: 2.5,
      interval: 0,
      nextReviewAt: now,
      currentTestLevel: 0,
      mastery: 0,
      lastRatedAt: null,
    },
  }))
}

function masteryFromEaseFactor(easeFactor: number): number {
  return Math.max(0, Math.min(100, Math.round(easeFactor * 25)))
}

function averageMastery(meanings: UserWordMeaningRow[]): number {
  if (meanings.length === 0) return 0
  return Math.round(meanings.reduce((sum, meaning) => sum + meaning.mastery, 0) / meanings.length)
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toDateOrNull(value: Date | string | null): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function asPrisma(value: unknown): InternalPrismaClient {
  return value as InternalPrismaClient
}

function asReadyCourseRow(value: unknown): ReadyCourseRow {
  return value as ReadyCourseRow
}

function asLessonRow(value: unknown): LessonRow {
  return value as LessonRow
}

function asLessonWordRowOrNull(value: unknown): LessonWordRow | null {
  return value ? value as LessonWordRow : null
}

function asWordProgressRowOrNull(value: unknown): UserStoryWordProgressRow | null {
  return value ? value as UserStoryWordProgressRow : null
}

function asStoryReviewAttemptRowOrNull(value: unknown): StoryReviewAttemptRow | null {
  return value ? value as StoryReviewAttemptRow : null
}

function asUserWordRow(value: unknown): UserWordRow {
  return value as UserWordRow
}

function asUserWordMeaningRow(value: unknown): UserWordMeaningRow {
  return value as UserWordMeaningRow
}

function asUserWordMeaningRowOrNull(value: unknown): UserWordMeaningRow | null {
  return value ? value as UserWordMeaningRow : null
}