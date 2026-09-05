import { STORY_ERROR_CODES, isStoryDomainError } from './story-errors'
import type {
  StoryLessonDetail,
  StoryLessonListItem,
  StoryLessonWordPage,
  UserStoryProgressDto,
} from './story-service'
import type {
  DueStoryWord,
  StoryReviewResult,
  StoryReviewSubmissionResult,
} from './story-review'
import type { StoryFirstPassStep } from './story-progress'
import type { StoryLessonDocument } from './story-types'
export { parseStoryCompletionPayload, parseStoryFirstPassStep, parseStoryParagraphIndex, parseStoryParagraphStep } from './story-completion-api'
export type { StoryCompletionApiResponse, StoryCompletionHistoryApiResponse, StoryCompletionPayload } from './story-completion-api'

export type StoryLessonsApiResponse = {
  lessons: StoryLessonListItem[]
  currentLessonId: string | null
  dueCount: number
}

export type PublicStoryLessonContent = Omit<
  StoryLessonDocument,
  'sourceSummary' | 'continuityNotes'
>

export type PublicStoryLessonDetail = Omit<StoryLessonDetail, 'content'> & {
  content: PublicStoryLessonContent
}

export type StoryLessonApiResponse = {
  lesson: PublicStoryLessonDetail
}

export type StoryProgressApiResponse = {
  progress: UserStoryProgressDto
}

export type StoryLessonWordsApiResponse = StoryLessonWordPage

export type StoryDueLessonGroup = {
  lessonId: string
  lessonOrder: number
  lessonTitle: string
  dueCount: number
  words: DueStoryWord[]
}

export type StoryReviewQueueApiResponse = {
  lessons: StoryDueLessonGroup[]
  dueCount: number
}

export type StoryReviewState = Omit<StoryReviewResult, 'nextReviewAt'> & {
  nextReviewAt: string | null
}

export type StoryReviewApiResponse = {
  review: StoryReviewState
}

export type StoryWordsQuery = {
  query?: string
  scene?: string
  page: number
  pageSize: number
}

export type StoryApiErrorStatus = 404 | 409 | 500

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const MAX_FILTER_LENGTH = 100
const MAX_IDENTIFIER_LENGTH = 200

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalString(value: string | null): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_IDENTIFIER_LENGTH
}

function parsePositiveInteger(value: string | null, fallback: number, maximum?: number): number | null {
  if (value === null) return fallback
  if (!/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) return null
  return parsed
}

export function parseStoryProgressPayload(value: unknown): { step: StoryFirstPassStep } | null {
  if (!isPlainObject(value)) return null
  if (value.step !== 1 && value.step !== 2 && value.step !== 3) return null
  return { step: value.step }
}

export function parseStoryReviewPayload(value: unknown): {
  lessonWordId: string
  round: number
  result: StoryReviewSubmissionResult
} | null {
  if (!isPlainObject(value) || !isValidIdentifier(value.lessonWordId) || !isReviewRound(value.round)) return null
  if (value.result !== 'remembered' && value.result !== 'vague' && value.result !== 'forgotten') return null
  return { lessonWordId: value.lessonWordId.trim(), round: value.round, result: value.result }
}

export function parseStoryReviewApiResponse(
  value: unknown,
  expected: {
    lessonWordId: string
    round: number
    result: StoryReviewSubmissionResult
    submittedAt: Date
  },
): StoryReviewState | null {
  if (!isPlainObject(value) || !isPlainObject(value.review)) return null
  if (!Number.isFinite(expected.submittedAt.getTime())) return null

  const review = value.review
  if (review.lessonWordId !== expected.lessonWordId) return null
  if (!isReviewRound(review.round) || !isReviewRound(review.roundCompleted)) return null
  if (review.round !== expected.round || review.roundCompleted !== expected.round) return null
  if (!isStoryReviewResult(review.result) || review.result !== expected.result) return null
  const grade = reviewGradeForResult(expected.result)
  if (review.grade !== grade) return null
  if (!isMastery(review.userWordMeaningMastery) || !isMastery(review.userWordMastery)) return null
  if (!isValidReviewDate(review.nextReviewAt, review.round)) return null

  return {
    lessonWordId: review.lessonWordId,
    round: review.round,
    roundCompleted: review.roundCompleted,
    result: review.result,
    nextReviewAt: review.nextReviewAt,
    grade,
    userWordMeaningMastery: review.userWordMeaningMastery,
    userWordMastery: review.userWordMastery,
  }
}

function isReviewRound(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 5
}

function isStoryReviewResult(value: unknown): value is StoryReviewSubmissionResult {
  return value === 'remembered' || value === 'vague' || value === 'forgotten'
}

function isMastery(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function reviewGradeForResult(result: StoryReviewSubmissionResult): 0 | 2 | 4 {
  if (result === 'remembered') return 4
  if (result === 'vague') return 2
  return 0
}

function isValidReviewDate(value: unknown, round: number): value is string | null {
  if (round === 5) return value === null
  if (typeof value !== 'string') return false

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

export function parseStoryWordsQuery(searchParams: URLSearchParams): StoryWordsQuery | null {
  const query = normalizeOptionalString(searchParams.get('query'))
  const scene = normalizeOptionalString(searchParams.get('scene'))
  const page = parsePositiveInteger(searchParams.get('page'), 1)
  const pageSize = parsePositiveInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  if (page === null || pageSize === null) return null
  if ((query?.length ?? 0) > MAX_FILTER_LENGTH || (scene?.length ?? 0) > MAX_FILTER_LENGTH) return null

  return { ...(query ? { query } : {}), ...(scene ? { scene } : {}), page, pageSize }
}

export function toPublicStoryLessonDetail(lesson: StoryLessonDetail): PublicStoryLessonDetail {
  return {
    ...lesson,
    content: {
      title: lesson.content.title,
      order: lesson.content.order,
      sourceChapterStart: lesson.content.sourceChapterStart,
      sourceChapterEnd: lesson.content.sourceChapterEnd,
      paragraphs: lesson.content.paragraphs,
    },
  }
}

export function normalizeStoryIdentifier(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null
}

export function groupDueStoryWords(words: DueStoryWord[]): StoryReviewQueueApiResponse {
  const groups = new Map<string, StoryDueLessonGroup>()

  for (const word of words) {
    const existing = groups.get(word.lessonId)
    if (existing) {
      existing.words.push(word)
      existing.dueCount += 1
      continue
    }
    groups.set(word.lessonId, {
      lessonId: word.lessonId,
      lessonOrder: word.lessonOrder,
      lessonTitle: word.lessonTitle,
      dueCount: 1,
      words: [word],
    })
  }

  return { lessons: [...groups.values()], dueCount: words.length }
}

export function serializeStoryReviewResult(result: StoryReviewResult): StoryReviewState {
  return {
    ...result,
    nextReviewAt: result.nextReviewAt ? result.nextReviewAt.toISOString() : null,
  }
}

export function classifyStoryApiError(error: unknown): StoryApiErrorStatus {
  if (!isStoryDomainError(error)) return 500

  switch (error.code) {
    case STORY_ERROR_CODES.READY_COURSE_NOT_FOUND:
    case STORY_ERROR_CODES.LESSON_NOT_FOUND:
    case STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND:
    case STORY_ERROR_CODES.LESSON_WORD_NOT_FOUND:
    case STORY_ERROR_CODES.LESSON_WORD_NOT_REVIEWABLE:
      return 404
    case STORY_ERROR_CODES.COMPLETION_ID_CONFLICT:
    case STORY_ERROR_CODES.REVIEW_NOT_DUE:
    case STORY_ERROR_CODES.REVIEW_ROUNDS_COMPLETE:
    case STORY_ERROR_CODES.REVIEW_RESULT_CONFLICT:
    case STORY_ERROR_CODES.REVIEW_ROUND_MISMATCH:
    case STORY_ERROR_CODES.REVIEW_RETRY_EXHAUSTED:
      return 409
    default:
      return 500
  }
}
