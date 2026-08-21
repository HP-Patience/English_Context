import { STORY_ERROR_CODES, StoryDomainError } from './story-errors'
import { completeFirstPass, getNextStep, initialProgress } from './story-progress'
import type { StoryFirstPassStep, StoryLessonStep, StoryProgressState, StoryProgressStatus } from './story-progress'
import { parseStoryContent } from './story-types'
import type { StoryLessonDocument } from './story-types'

const READY_COURSE_SLOT = 'ready'
const READY_STATUS = 'ready'

type InternalPrismaClient = {
  $transaction<T>(callback: (tx: InternalPrismaClient) => Promise<T>, options?: unknown): Promise<T>
  storyCourse: {
    findUnique(args: unknown): Promise<unknown>
  }
  storyLesson: {
    findMany(args: unknown): Promise<unknown[]>
    findFirst(args: unknown): Promise<unknown>
  }
  userStoryProgress: {
    findUnique(args: unknown): Promise<unknown>
    upsert(args: unknown): Promise<unknown>
  }
}

type StoryServiceParams = {
  prisma: unknown
  userId: string
  now?: Date
}

export type StoryLessonListItem = {
  id: string
  order: number
  title: string
  sourceChapterStart: string
  sourceChapterEnd: string
  targetWordCount: number
  status: StoryProgressStatus
  completedStep: 0 | StoryFirstPassStep
  currentStep: StoryLessonStep
  dueReviewCount: number
}

export type StoryLessonWordDto = {
  id: string
  sortOrder: number
  glossCn: string
  word: {
    id: string
    text: string
    phonetic: string | null
  }
  meaning: {
    id: string
    partOfSpeech: string
    definition: string
    definitionCn: string | null
    example: string | null
  }
}

export type StoryLessonWordListItem = StoryLessonWordDto & {
  sceneTitle: string
}

export type StoryLessonWordPage = {
  lessonId: string
  words: StoryLessonWordListItem[]
  scenes: string[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type UserStoryProgressDto = {
  userId: string
  lessonId: string
  status: StoryProgressStatus
  currentStep: StoryLessonStep
  completedStep: 0 | StoryFirstPassStep
  step1CompletedAt: string | null
  step2CompletedAt: string | null
  step3CompletedAt: string | null
  completedAt: string | null
}

export type StoryLessonDetail = {
  id: string
  order: number
  title: string
  sourceChapterStart: string
  sourceChapterEnd: string
  content: StoryLessonDocument
  lessonWords: StoryLessonWordDto[]
  progress: UserStoryProgressDto
  dueReviewCount: number
}

type ReadyCourseRow = {
  id: string
  status: string
  readySlot: string | null
}

type ProgressRow = {
  userId: string
  lessonId: string
  currentStep: number
  status: string
  step1CompletedAt: Date | string | null
  step2CompletedAt: Date | string | null
  step3CompletedAt: Date | string | null
  completedAt: Date | string | null
}

type WordProgressRow = {
  userId: string
  lessonWordId: string
  reviewRoundCompleted: number
  nextReviewAt: Date | string | null
}

type LessonWordRow = {
  id: string
  sortOrder: number
  glossCn: string
  word: { id: string; text: string; phonetic: string | null }
  meaning: {
    id: string
    partOfSpeech?: string | null
    definition?: string | null
    definitionCn?: string | null
    example?: string | null
  }
  userProgress?: WordProgressRow[]
}

type LessonRow = {
  id: string
  order: number
  title: string
  sourceChapterStart: string
  sourceChapterEnd: string
  contentJson: string
  words?: LessonWordRow[]
  userProgress?: ProgressRow[]
}

export async function listStoryLessons({ prisma, userId, now = new Date() }: StoryServiceParams): Promise<StoryLessonListItem[]> {
  const client = asPrisma(prisma)
  const course = await findReadyCourse(client)
  if (!course) return []

  const lessons = (await client.storyLesson.findMany({
    where: { courseId: course.id, status: READY_STATUS },
    orderBy: { order: 'asc' },
    include: lessonInclude(userId),
  })).map(asLessonRow)

  return lessons.map((lesson) => {
    const progress = progressDtoFromRow(firstProgress(lesson), userId, lesson.id)
    return {
      id: lesson.id,
      order: lesson.order,
      title: lesson.title,
      sourceChapterStart: lesson.sourceChapterStart,
      sourceChapterEnd: lesson.sourceChapterEnd,
      targetWordCount: orderedLessonWords(lesson).length,
      status: progress.status,
      completedStep: progress.completedStep,
      currentStep: progress.currentStep,
      dueReviewCount: countDueReviews(lesson, progress, userId, now),
    }
  })
}

export async function getStoryLesson({
  prisma,
  userId,
  lessonId,
  now = new Date(),
}: StoryServiceParams & { lessonId: string }): Promise<StoryLessonDetail | null> {
  const client = asPrisma(prisma)
  const course = await findReadyCourse(client)
  if (!course) return null

  const row = await client.storyLesson.findFirst({
    where: { id: lessonId, courseId: course.id, status: READY_STATUS },
    include: lessonInclude(userId),
  })
  if (!row) return null

  const lesson = asLessonRow(row)
  const progress = progressDtoFromRow(firstProgress(lesson), userId, lesson.id)

  return {
    id: lesson.id,
    order: lesson.order,
    title: lesson.title,
    sourceChapterStart: lesson.sourceChapterStart,
    sourceChapterEnd: lesson.sourceChapterEnd,
    content: parseStoryContent(lesson.contentJson),
    lessonWords: orderedLessonWords(lesson).map(toLessonWordDto),
    progress,
    dueReviewCount: countDueReviews(lesson, progress, userId, now),
  }
}

export async function listStoryLessonWords({
  prisma,
  userId,
  lessonId,
  query,
  scene,
  page = 1,
  pageSize = 25,
}: StoryServiceParams & {
  lessonId: string
  query?: string
  scene?: string
  page?: number
  pageSize?: number
}): Promise<StoryLessonWordPage | null> {
  const lesson = await getStoryLesson({ prisma, userId, lessonId })
  if (!lesson) return null

  const sceneByWordOrder = new Map<number, string>()
  const scenes: string[] = []
  for (const paragraph of lesson.content.paragraphs) {
    if (!scenes.includes(paragraph.sceneTitle)) scenes.push(paragraph.sceneTitle)
    for (const segment of paragraph.segments) {
      if (segment.type === 'targetWord') {
        sceneByWordOrder.set(segment.wordOrder, paragraph.sceneTitle)
      }
    }
  }

  const normalizedQuery = query?.trim().toLocaleLowerCase() ?? ''
  const normalizedScene = scene?.trim() ?? ''
  const words = lesson.lessonWords
    .map((word): StoryLessonWordListItem => ({
      ...word,
      sceneTitle: sceneByWordOrder.get(word.sortOrder) ?? '',
    }))
    .filter((word) => !normalizedScene || word.sceneTitle === normalizedScene)
    .filter((word) => !normalizedQuery || storyWordSearchText(word).includes(normalizedQuery))

  const total = words.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  const offset = (page - 1) * pageSize

  return {
    lessonId,
    words: words.slice(offset, offset + pageSize),
    scenes,
    pagination: { page, pageSize, total, totalPages },
  }
}

export async function saveFirstPassStep({
  prisma,
  userId,
  lessonId,
  step,
  now = new Date(),
}: StoryServiceParams & { lessonId: string; step: StoryFirstPassStep }): Promise<UserStoryProgressDto> {
  const client = asPrisma(prisma)

  return client.$transaction(async (tx) => {
    const course = await findReadyCourse(tx)
    if (!course) {
      throw new StoryDomainError(
        STORY_ERROR_CODES.READY_COURSE_NOT_FOUND,
        'No ready story course is published',
      )
    }

    const lesson = await tx.storyLesson.findFirst({
      where: { id: lessonId, courseId: course.id, status: READY_STATUS },
    })
    if (!lesson) {
      throw new StoryDomainError(
        STORY_ERROR_CODES.LESSON_NOT_FOUND,
        `Story lesson is not ready or does not exist: ${lessonId}`,
      )
    }

    const existing = asProgressRowOrNull(await tx.userStoryProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    }))
    const existingDto = progressDtoFromRow(existing, userId, lessonId)

    if (existingDto.completedStep >= step) {
      return existingDto
    }

    const nextState = completeFirstPass(progressStateFromRow(existing), step)
    const timestamp = now
    const data = progressDataForStep({ userId, lessonId, existing, nextState, step, timestamp })

    const saved = await tx.userStoryProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: data,
      update: data,
    })

    return progressDtoFromRow(asProgressRow(saved), userId, lessonId)
  }, { isolationLevel: 'Serializable' })
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

function lessonInclude(userId: string) {
  return {
    userProgress: { where: { userId }, take: 1 },
    words: {
      orderBy: { sortOrder: 'asc' },
      include: {
        word: true,
        meaning: true,
        userProgress: { where: { userId } },
      },
    },
  }
}

function progressDataForStep({
  userId,
  lessonId,
  existing,
  nextState,
  step,
  timestamp,
}: {
  userId: string
  lessonId: string
  existing: ProgressRow | null
  nextState: StoryProgressState
  step: StoryFirstPassStep
  timestamp: Date
}) {
  const completedAt = step === 3 ? existing?.completedAt ?? timestamp : existing?.completedAt ?? null

  return {
    userId,
    lessonId,
    currentStep: getNextStep(nextState),
    status: nextState.status,
    step1CompletedAt: step === 1 ? existing?.step1CompletedAt ?? timestamp : existing?.step1CompletedAt ?? null,
    step2CompletedAt: step === 2 ? existing?.step2CompletedAt ?? timestamp : existing?.step2CompletedAt ?? null,
    step3CompletedAt: step === 3 ? existing?.step3CompletedAt ?? timestamp : existing?.step3CompletedAt ?? null,
    completedAt,
  }
}

function progressStateFromRow(row: ProgressRow | null): StoryProgressState {
  if (!row) return initialProgress
  return {
    status: normalizeStatus(row.status),
    completedSteps: completedStepsFromRow(row),
    reviewRoundCompleted: 0,
  }
}

function progressDtoFromRow(row: ProgressRow | null, userId: string, lessonId: string): UserStoryProgressDto {
  if (!row) {
    return {
      userId,
      lessonId,
      status: initialProgress.status,
      currentStep: getNextStep(initialProgress),
      completedStep: 0,
      step1CompletedAt: null,
      step2CompletedAt: null,
      step3CompletedAt: null,
      completedAt: null,
    }
  }

  const completedSteps = completedStepsFromRow(row)
  const state = progressStateFromRow(row)
  const currentStep = isStoryLessonStep(row.currentStep) ? row.currentStep : getNextStep(state)

  return {
    userId: row.userId,
    lessonId: row.lessonId,
    status: normalizeStatus(row.status),
    currentStep,
    completedStep: completedSteps[completedSteps.length - 1] ?? 0,
    step1CompletedAt: toIso(row.step1CompletedAt),
    step2CompletedAt: toIso(row.step2CompletedAt),
    step3CompletedAt: toIso(row.step3CompletedAt),
    completedAt: toIso(row.completedAt),
  }
}

function completedStepsFromRow(row: ProgressRow): StoryFirstPassStep[] {
  const steps: StoryFirstPassStep[] = []
  if (row.step1CompletedAt) steps.push(1)
  if (row.step2CompletedAt) steps.push(2)
  if (row.step3CompletedAt) steps.push(3)
  return steps
}

function countDueReviews(lesson: LessonRow, progress: UserStoryProgressDto, userId: string, now: Date): number {
  if (progress.completedStep < 3) return 0
  return orderedLessonWords(lesson).filter((word) => {
    const userProgress = (word.userProgress ?? []).find((row) => row.userId === userId)
    if (!userProgress) return true
    if (userProgress.reviewRoundCompleted >= 5) return false
    if (!userProgress.nextReviewAt) return true
    return new Date(userProgress.nextReviewAt) <= now
  }).length
}

function orderedLessonWords(lesson: LessonRow): LessonWordRow[] {
  return [...(lesson.words ?? [])].sort((left, right) => left.sortOrder - right.sortOrder)
}

function toLessonWordDto(row: LessonWordRow): StoryLessonWordDto {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    glossCn: row.glossCn,
    word: {
      id: row.word.id,
      text: row.word.text,
      phonetic: row.word.phonetic ?? null,
    },
    meaning: {
      id: row.meaning.id,
      partOfSpeech: row.meaning.partOfSpeech ?? '',
      definition: row.meaning.definition ?? '',
      definitionCn: row.meaning.definitionCn ?? null,
      example: row.meaning.example ?? null,
    },
  }
}

function storyWordSearchText(word: StoryLessonWordListItem): string {
  return [
    word.word.text,
    word.glossCn,
    word.sceneTitle,
    word.meaning.partOfSpeech,
    word.meaning.definition,
    word.meaning.definitionCn ?? '',
    word.meaning.example ?? '',
  ].join('\n').toLocaleLowerCase()
}

function firstProgress(lesson: LessonRow): ProgressRow | null {
  return lesson.userProgress?.[0] ?? null
}

function normalizeStatus(status: string): StoryProgressStatus {
  if (
    status === 'learning' ||
    status === 'first_passed' ||
    status === 'reviewing' ||
    status === 'reinforced'
  ) {
    return status
  }
  return 'not_started'
}

function isStoryLessonStep(value: number): value is StoryLessonStep {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
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

function asProgressRow(value: unknown): ProgressRow {
  return value as ProgressRow
}

function asProgressRowOrNull(value: unknown): ProgressRow | null {
  return value ? asProgressRow(value) : null
}