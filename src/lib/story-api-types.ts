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

export type StoryLessonsApiResponse = {
  lessons: StoryLessonListItem[]
  currentLessonId: string | null
  dueCount: number
}

export type StoryLessonApiResponse = {
  lesson: StoryLessonDetail
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
  result: StoryReviewSubmissionResult
} | null {
  if (!isPlainObject(value) || !isValidIdentifier(value.lessonWordId)) return null
  if (value.result !== 'remembered' && value.result !== 'vague' && value.result !== 'forgotten') return null
  return { lessonWordId: value.lessonWordId.trim(), result: value.result }
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
  const message = error instanceof Error ? error.message : String(error)

  if (
    /No ready story course is published/.test(message) ||
    /Story lesson is not ready or does not exist/.test(message) ||
    /not in the current ready story course/.test(message) ||
    /before Step3 is completed/.test(message)
  ) {
    return 404
  }

  if (
    /Cannot complete Step\d before Step\d/.test(message) ||
    /not due for review/.test(message) ||
    /already completed all \d+ review rounds/.test(message) ||
    /already committed with a different result/.test(message)
  ) {
    return 409
  }

  return 500
}
