export type StoryLessonDocument = {
  title: string
  order: number
  sourceChapterStart: string
  sourceChapterEnd: string
  sourceSummary: string
  continuityNotes: string
  paragraphs: StoryLessonParagraph[]
}

export type StoryLessonParagraph = {
  sceneTitle: string
  segments: StoryLessonSegment[]
}

export type StoryLessonSegment = TextSegment | TargetWordSegment

export type TextSegment = {
  type: 'text'
  value: string
}

export type TargetWordSegment = {
  type: 'targetWord'
  word: string
  definitionCn: string
  phonetic: string
  wordOrder: number
}

const MAX_TARGET_WORDS = 100

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function addRequiredStringError(errors: string[], value: unknown, path: string) {
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`)
  }
}

function validateStoryLessonDocument(value: unknown): StoryLessonDocument {
  const errors: string[] = []
  const seenWordOrders = new Set<number>()
  let targetWordCount = 0

  if (!isPlainObject(value)) {
    throw new Error('Invalid story lesson content: lesson document must be an object')
  }

  addRequiredStringError(errors, value.title, 'title')

  if (!Number.isInteger(value.order) || Number(value.order) < 1) {
    errors.push('order must be a positive integer')
  }

  addRequiredStringError(errors, value.sourceChapterStart, 'sourceChapterStart')
  addRequiredStringError(errors, value.sourceChapterEnd, 'sourceChapterEnd')
  addRequiredStringError(errors, value.sourceSummary, 'sourceSummary')
  addRequiredStringError(errors, value.continuityNotes, 'continuityNotes')

  if (!Array.isArray(value.paragraphs) || value.paragraphs.length === 0) {
    errors.push('paragraphs must be a non-empty array')
  } else {
    for (const [paragraphIndex, paragraph] of value.paragraphs.entries()) {
      const paragraphPath = `paragraphs[${paragraphIndex}]`

      if (!isPlainObject(paragraph)) {
        errors.push(`${paragraphPath} must be an object`)
        continue
      }

      addRequiredStringError(errors, paragraph.sceneTitle, `${paragraphPath}.sceneTitle`)

      if (!Array.isArray(paragraph.segments) || paragraph.segments.length === 0) {
        errors.push(`${paragraphPath}.segments must be a non-empty array`)
        continue
      }

      for (const [segmentIndex, segment] of paragraph.segments.entries()) {
        const segmentPath = `${paragraphPath}.segments[${segmentIndex}]`

        if (!isPlainObject(segment)) {
          errors.push(`${segmentPath} must be an object`)
          continue
        }

        if (segment.type === 'text') {
          addRequiredStringError(errors, segment.value, `${segmentPath}.value`)
          continue
        }

        if (segment.type === 'targetWord') {
          targetWordCount += 1
          addRequiredStringError(errors, segment.word, `${segmentPath}.word`)
          addRequiredStringError(errors, segment.definitionCn, `${segmentPath}.definitionCn`)
          addRequiredStringError(errors, segment.phonetic, `${segmentPath}.phonetic`)

          if (!Number.isInteger(segment.wordOrder) || Number(segment.wordOrder) < 1) {
            errors.push(`${segmentPath}.wordOrder must be a positive integer`)
          } else if (seenWordOrders.has(Number(segment.wordOrder))) {
            errors.push(`${segmentPath}.wordOrder must be unique; duplicate value ${segment.wordOrder}`)
          } else {
            seenWordOrders.add(Number(segment.wordOrder))
          }

          continue
        }

        errors.push(`${segmentPath}.type must be either "text" or "targetWord"`)
      }
    }
  }

  if (targetWordCount > MAX_TARGET_WORDS) {
    errors.push(`lesson has ${targetWordCount} target words; maximum is ${MAX_TARGET_WORDS}`)
  }

  if (errors.length > 0) {
    throw new Error(`Invalid story lesson content:\n${errors.join('\n')}`)
  }

  return value as StoryLessonDocument
}

export function parseStoryContent(contentJson: string): StoryLessonDocument {
  let parsed: unknown

  try {
    parsed = JSON.parse(contentJson)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid story lesson content: persisted JSON is not valid JSON (${reason})`)
  }

  return validateStoryLessonDocument(parsed)
}
