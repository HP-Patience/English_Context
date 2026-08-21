export const STORY_ERROR_CODES = {
  READY_COURSE_NOT_FOUND: 'STORY_READY_COURSE_NOT_FOUND',
  LESSON_NOT_FOUND: 'STORY_LESSON_NOT_FOUND',
  PROGRESS_SEQUENCE_CONFLICT: 'STORY_PROGRESS_SEQUENCE_CONFLICT',
  LESSON_WORD_NOT_FOUND: 'STORY_LESSON_WORD_NOT_FOUND',
  LESSON_WORD_NOT_REVIEWABLE: 'STORY_LESSON_WORD_NOT_REVIEWABLE',
  REVIEW_NOT_DUE: 'STORY_REVIEW_NOT_DUE',
  REVIEW_ROUNDS_COMPLETE: 'STORY_REVIEW_ROUNDS_COMPLETE',
  REVIEW_RESULT_CONFLICT: 'STORY_REVIEW_RESULT_CONFLICT',
  REVIEW_RETRY_EXHAUSTED: 'STORY_REVIEW_RETRY_EXHAUSTED',
} as const

export type StoryDomainErrorCode = typeof STORY_ERROR_CODES[keyof typeof STORY_ERROR_CODES]

export class StoryDomainError extends Error {
  readonly code: StoryDomainErrorCode

  constructor(code: StoryDomainErrorCode, message: string) {
    super(message)
    this.name = 'StoryDomainError'
    this.code = code
  }
}

export function isStoryDomainError(error: unknown): error is StoryDomainError {
  return error instanceof StoryDomainError
}
