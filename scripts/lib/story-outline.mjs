import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const DEFAULT_CHAPTER_BATCH_SIZE = 25
export const MIN_LESSON_COUNT = 61
export const TARGET_MIN_LESSON_COUNT = 80
export const TARGET_MAX_LESSON_COUNT = 100
export const MAX_LESSON_COUNT = 150
export const MIN_TARGET_WORD_CAPACITY = 40
export const MAX_TARGET_WORD_CAPACITY = 100

/**
 * @typedef {Object} ChapterSummary
 * @property {number} order
 * @property {number} sourceChapterStart
 * @property {number} sourceChapterEnd
 * @property {string} summary
 * @property {string[]} characters
 * @property {string[]} events
 * @property {string} [continuityStart]
 * @property {string} [continuityEnd]
 */

/**
 * @typedef {Object} StoryOutlineLesson
 * @property {number} order
 * @property {number|string} sourceChapterStart
 * @property {number|string} sourceChapterEnd
 * @property {string} plotSummary
 * @property {string[]} characters
 * @property {string[]} events
 * @property {string} continuityStart
 * @property {string} continuityEnd
 * @property {number} targetWordCapacity
 */

/**
 * @typedef {Object} StoryOutline
 * @property {string} generatedAt
 * @property {number} lessonCount
 * @property {number} vocabularyCount
 * @property {StoryOutlineLesson[]} lessons
 */

/**
 * Build chronological chapter-range summaries with a checkpoint after every batch.
 *
 * @param {{ chapters: Array<{ order: number, title: string, characterCount?: number }>, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, checkpointPath: string, chapterBatchSize?: number }} options
 * @returns {Promise<ChapterSummary[]>}
 */
export async function buildChapterSummaries({
  chapters,
  generateJson,
  checkpointPath,
  chapterBatchSize = DEFAULT_CHAPTER_BATCH_SIZE,
}) {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error('buildChapterSummaries requires a non-empty chapters array')
  }
  if (typeof generateJson !== 'function') {
    throw new TypeError('buildChapterSummaries requires generateJson')
  }
  if (!checkpointPath) {
    throw new TypeError('buildChapterSummaries requires checkpointPath')
  }
  if (!Number.isInteger(chapterBatchSize) || chapterBatchSize < 1) {
    throw new TypeError('chapterBatchSize must be a positive integer')
  }

  const orderedChapters = normalizeChapters(chapters)
  const batches = chunk(orderedChapters, chapterBatchSize)
  const checkpoint = await readJsonIfExists(checkpointPath)
  const summariesByRange = new Map()

  if (Array.isArray(checkpoint?.summaries)) {
    for (const summary of checkpoint.summaries) {
      const normalized = normalizeChapterSummary(summary)
      if (normalized) {
        summariesByRange.set(rangeKey(normalized.sourceChapterStart, normalized.sourceChapterEnd), normalized)
      }
    }
  }

  const summaries = []

  for (const [batchIndex, batch] of batches.entries()) {
    const start = batch[0].order
    const end = batch[batch.length - 1].order
    const key = rangeKey(start, end)
    let summary = summariesByRange.get(key)

    if (!summary) {
      const prompt = createChapterSummaryPrompt({ batch, batchIndex, batchCount: batches.length })
      const response = await generateJson(prompt, 'chapter-summary')
      summary = normalizeChapterSummaryResponse(response, { batch, batchIndex })
      summariesByRange.set(key, summary)
      await writeJsonAtomic(checkpointPath, {
        version: 1,
        chapterBatchSize,
        generatedAt: new Date().toISOString(),
        summaries: batches
          .map((candidateBatch) => summariesByRange.get(rangeKey(candidateBatch[0].order, candidateBatch[candidateBatch.length - 1].order)))
          .filter(Boolean),
      })
    }

    summaries.push(summary)
  }

  return summaries
}

/**
 * Build and validate a continuity-aware lesson outline, resuming a valid final checkpoint.
 *
 * @param {{ chapterSummaries: ChapterSummary[], vocabularyCount: number, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, checkpointPath: string }} options
 * @returns {Promise<StoryOutline>}
 */
export async function buildStoryOutline({ chapterSummaries, vocabularyCount, generateJson, checkpointPath }) {
  if (!Array.isArray(chapterSummaries) || chapterSummaries.length === 0) {
    throw new Error('buildStoryOutline requires a non-empty chapterSummaries array')
  }
  if (!Number.isInteger(vocabularyCount) || vocabularyCount < 0) {
    throw new TypeError('vocabularyCount must be a non-negative integer')
  }
  if (typeof generateJson !== 'function') {
    throw new TypeError('buildStoryOutline requires generateJson')
  }
  if (!checkpointPath) {
    throw new TypeError('buildStoryOutline requires checkpointPath')
  }

  const existing = await readJsonIfExists(checkpointPath)
  if (existing?.lessons) {
    const normalizedExisting = normalizeStoryOutline(existing, { vocabularyCount, generatedAt: existing.generatedAt })
    validateStoryOutline(normalizedExisting, chapterSummaries)
    return normalizedExisting
  }

  const normalizedSummaries = chapterSummaries.map((summary) => {
    const normalized = normalizeChapterSummary(summary)
    if (!normalized) {
      throw new Error('chapterSummaries contains an invalid summary')
    }
    return normalized
  })
  const prompt = createStoryOutlinePrompt({ chapterSummaries: normalizedSummaries, vocabularyCount })
  const response = await generateJson(prompt, 'story-outline')
  const responseLessons = findLessonsArray(response)
  const outline = responseLessons
    ? normalizeStoryOutline({ ...(isPlainObject(response) ? response : {}), lessons: responseLessons }, { vocabularyCount })
    : createDeterministicOutline({ chapterSummaries: normalizedSummaries, vocabularyCount })

  validateStoryOutline(outline, normalizedSummaries)
  await writeJsonAtomic(checkpointPath, outline)
  return outline
}

export function createChapterSummaryPrompt({ batch, batchIndex, batchCount }) {
  const start = batch[0].order
  const end = batch[batch.length - 1].order
  return [
    `Summarize source chapters ${start}-${end} for a continuous main-line retelling outline.`,
    `This is batch ${batchIndex + 1} of ${batchCount}. Use only the provided metadata; no raw novel text is available.`,
    'Return JSON with: summary (string), characters (string[]), events (string[]), optional continuityStart, optional continuityEnd.',
    'Keep chronological order and focus on plot-significant main-line developments inferred from chapter titles.',
    'Chapter metadata:',
    JSON.stringify(batch.map(({ order, title, characterCount }) => ({ order, title, characterCount }))),
  ].join('\n')
}

export function createStoryOutlinePrompt({ chapterSummaries, vocabularyCount }) {
  const targetLessonCount = chooseTargetLessonCount({ chapterSpan: getChapterSpan(chapterSummaries), vocabularyCount })
  const capacityHint = chooseTargetWordCapacity({ vocabularyCount, lessonCount: targetLessonCount })

  return [
    'Create a continuity-aware 61-150 lesson outline for a full continuous main-line retelling.',
    `Target ${TARGET_MIN_LESSON_COUNT}-${TARGET_MAX_LESSON_COUNT} lessons when possible; never exceed ${MAX_LESSON_COUNT}. Suggested lesson count: ${targetLessonCount}.`,
    'Every lesson must be in chronological ordering with explicit source chapter ranges and no overlap or gaps.',
    'Each lesson needs a continuity handoff: continuityStart says what state it receives, continuityEnd says what state it passes to the next lesson.',
    `Set targetWordCapacity between ${MIN_TARGET_WORD_CAPACITY} and ${MAX_TARGET_WORD_CAPACITY}; suggested value ${capacityHint}.`,
    `Vocabulary count to distribute: ${vocabularyCount}.`,
    'Return JSON object: { "lessons": [{ "order", "sourceChapterStart", "sourceChapterEnd", "plotSummary", "characters", "events", "continuityStart", "continuityEnd", "targetWordCapacity" }] }.',
    'Use only these checkpointed metadata summaries; do not invent raw prose or quote source text.',
    JSON.stringify(chapterSummaries.map(({ order, sourceChapterStart, sourceChapterEnd, summary, characters, events, continuityStart, continuityEnd }) => ({
      order,
      sourceChapterStart,
      sourceChapterEnd,
      summary,
      characters,
      events,
      continuityStart,
      continuityEnd,
    }))),
  ].join('\n')
}

export function validateStoryOutline(outline, chapterSummaries = []) {
  const errors = []

  if (!isPlainObject(outline)) {
    throw new Error('story outline must be an object')
  }

  if (!Array.isArray(outline.lessons)) {
    errors.push('lessons must be an array')
  } else {
    if (outline.lessons.length < MIN_LESSON_COUNT || outline.lessons.length > MAX_LESSON_COUNT) {
      errors.push(`outline lesson count must be 61-150; received ${outline.lessons.length}`)
    }

    let previousEnd = null
    for (const [index, lesson] of outline.lessons.entries()) {
      const path = `lessons[${index}]`
      if (!isPlainObject(lesson)) {
        errors.push(`${path} must be an object`)
        continue
      }

      if (lesson.order !== index + 1) {
        errors.push(`${path}.order must be ${index + 1}`)
      }

      for (const field of ['plotSummary', 'continuityStart', 'continuityEnd']) {
        if (!isNonEmptyString(lesson[field])) {
          errors.push(`${path}.${field} must be a non-empty string`)
        }
      }

      for (const field of ['characters', 'events']) {
        if (!Array.isArray(lesson[field]) || lesson[field].some((value) => !isNonEmptyString(value))) {
          errors.push(`${path}.${field} must be an array of non-empty strings`)
        }
      }

      if (!Number.isInteger(lesson.targetWordCapacity)
        || lesson.targetWordCapacity < MIN_TARGET_WORD_CAPACITY
        || lesson.targetWordCapacity > MAX_TARGET_WORD_CAPACITY) {
        errors.push(`${path}.targetWordCapacity must be between ${MIN_TARGET_WORD_CAPACITY} and ${MAX_TARGET_WORD_CAPACITY}`)
      }

      const start = parseChapterReference(lesson.sourceChapterStart)
      const end = parseChapterReference(lesson.sourceChapterEnd)
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        errors.push(`${path}.sourceChapterStart/sourceChapterEnd must identify numeric chapters`)
        continue
      }

      if (start > end) {
        errors.push(`${path} has a backward chapter range ${start}-${end}`)
      }

      if (previousEnd !== null && start <= previousEnd) {
        errors.push(`${path} overlaps or moves backward from the previous range ending at ${previousEnd}`)
      }

      if (previousEnd !== null && start > previousEnd + 1) {
        errors.push(`${path} leaves a gap after chapter ${previousEnd}`)
      }

      previousEnd = end
    }

    const expectedSpan = getChapterSpan(chapterSummaries)
    if (expectedSpan) {
      const first = outline.lessons[0]
      const last = outline.lessons[outline.lessons.length - 1]
      const firstStart = parseChapterReference(first?.sourceChapterStart)
      const lastEnd = parseChapterReference(last?.sourceChapterEnd)
      if (Number.isInteger(firstStart) && firstStart > expectedSpan.start) {
        errors.push(`outline starts at chapter ${firstStart}; expected to cover from ${expectedSpan.start}`)
      }
      if (Number.isInteger(lastEnd) && lastEnd < expectedSpan.end) {
        errors.push(`outline ends at chapter ${lastEnd}; expected to cover through ${expectedSpan.end}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid story outline: ${errors.join('; ')}`)
  }

  return outline
}

function normalizeChapters(chapters) {
  return chapters
    .map((chapter) => ({
      order: Number(chapter?.order),
      title: String(chapter?.title ?? '').trim(),
      characterCount: Number.isFinite(Number(chapter?.characterCount)) ? Number(chapter.characterCount) : undefined,
    }))
    .filter((chapter) => Number.isInteger(chapter.order) && chapter.order > 0 && chapter.title)
    .sort((a, b) => a.order - b.order)
}

function normalizeChapterSummaryResponse(response, { batch, batchIndex }) {
  const start = batch[0].order
  const end = batch[batch.length - 1].order
  const candidate = Array.isArray(response?.summaries) ? response.summaries[0]
    : Array.isArray(response?.chapterSummaries) ? response.chapterSummaries[0]
      : response

  return {
    order: batchIndex + 1,
    sourceChapterStart: start,
    sourceChapterEnd: end,
    summary: normalizeText(candidate?.summary ?? candidate?.plotSummary ?? candidate?.sourceSummary, `Chapters ${start}-${end}`),
    characters: normalizeStringArray(candidate?.characters, ['方源']),
    events: normalizeStringArray(candidate?.events, [`Chapters ${start}-${end}`]),
    continuityStart: normalizeOptionalText(candidate?.continuityStart),
    continuityEnd: normalizeOptionalText(candidate?.continuityEnd),
  }
}

function normalizeChapterSummary(summary) {
  if (!isPlainObject(summary)) {
    return null
  }
  const sourceChapterStart = parseChapterReference(summary.sourceChapterStart)
  const sourceChapterEnd = parseChapterReference(summary.sourceChapterEnd)
  const order = Number(summary.order)

  if (!Number.isInteger(sourceChapterStart) || !Number.isInteger(sourceChapterEnd) || sourceChapterStart > sourceChapterEnd) {
    return null
  }

  return {
    order: Number.isInteger(order) && order > 0 ? order : sourceChapterStart,
    sourceChapterStart,
    sourceChapterEnd,
    summary: normalizeText(summary.summary ?? summary.plotSummary ?? summary.sourceSummary, `Chapters ${sourceChapterStart}-${sourceChapterEnd}`),
    characters: normalizeStringArray(summary.characters, ['方源']),
    events: normalizeStringArray(summary.events, [`Chapters ${sourceChapterStart}-${sourceChapterEnd}`]),
    continuityStart: normalizeOptionalText(summary.continuityStart),
    continuityEnd: normalizeOptionalText(summary.continuityEnd),
  }
}

function normalizeStoryOutline(value, { vocabularyCount, generatedAt = new Date().toISOString() }) {
  const lessons = findLessonsArray(value)?.map((lesson, index) => ({
    order: toPositiveInteger(lesson.order, index + 1),
    sourceChapterStart: normalizeChapterReferenceForOutput(lesson.sourceChapterStart),
    sourceChapterEnd: normalizeChapterReferenceForOutput(lesson.sourceChapterEnd),
    plotSummary: normalizeText(lesson.plotSummary ?? lesson.summary ?? lesson.sourceSummary, `Lesson ${index + 1}`),
    characters: normalizeStringArray(lesson.characters, ['方源']),
    events: normalizeStringArray(lesson.events, [`Lesson ${index + 1}`]),
    continuityStart: normalizeText(lesson.continuityStart, index === 0 ? 'Story begins.' : `Continue from lesson ${index}.`),
    continuityEnd: normalizeText(lesson.continuityEnd ?? lesson.continuityNotes, `Continue to lesson ${index + 2}.`),
    targetWordCapacity: Number(lesson.targetWordCapacity),
  })) ?? []

  return {
    generatedAt,
    lessonCount: lessons.length,
    vocabularyCount,
    lessons,
  }
}

function createDeterministicOutline({ chapterSummaries, vocabularyCount }) {
  const span = getChapterSpan(chapterSummaries)
  const chapterCount = span.end - span.start + 1
  const lessonCount = chooseTargetLessonCount({ chapterSpan: span, vocabularyCount })
  const targetWordCapacity = chooseTargetWordCapacity({ vocabularyCount, lessonCount })
  const lessons = []

  for (let index = 0; index < lessonCount; index += 1) {
    const start = span.start + Math.floor((index * chapterCount) / lessonCount)
    const end = span.start + Math.floor(((index + 1) * chapterCount) / lessonCount) - 1
    const clampedEnd = Math.max(start, end)
    const coveredSummaries = chapterSummaries.filter((summary) => summary.sourceChapterStart <= clampedEnd && summary.sourceChapterEnd >= start)
    const characters = uniqueNonEmpty(coveredSummaries.flatMap((summary) => summary.characters)).slice(0, 8)
    const events = uniqueNonEmpty(coveredSummaries.flatMap((summary) => summary.events)).slice(0, 10)
    const plotSummary = coveredSummaries.map((summary) => summary.summary).filter(Boolean).join('；') || `Chapters ${start}-${clampedEnd}`

    lessons.push({
      order: index + 1,
      sourceChapterStart: start,
      sourceChapterEnd: clampedEnd,
      plotSummary,
      characters: characters.length ? characters : ['方源'],
      events: events.length ? events : [`Chapters ${start}-${clampedEnd}`],
      continuityStart: index === 0 ? '主线从开篇状态开始。' : `承接第${index}课结束时的人物关系与冲突。`,
      continuityEnd: index === lessonCount - 1 ? '本阶段主线完整收束。' : `主要冲突推进到第${index + 2}课继续。`,
      targetWordCapacity,
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    lessonCount: lessons.length,
    vocabularyCount,
    lessons,
  }
}

function chooseTargetLessonCount({ chapterSpan, vocabularyCount }) {
  const chapterCount = chapterSpan ? chapterSpan.end - chapterSpan.start + 1 : TARGET_MIN_LESSON_COUNT
  const vocabularyDriven = vocabularyCount > 0 ? Math.ceil(vocabularyCount / 90) : 90
  const target = clamp(vocabularyDriven, TARGET_MIN_LESSON_COUNT, TARGET_MAX_LESSON_COUNT)
  const boundedByChapters = Math.min(target, chapterCount)
  return clamp(boundedByChapters, MIN_LESSON_COUNT, MAX_LESSON_COUNT)
}

function chooseTargetWordCapacity({ vocabularyCount, lessonCount }) {
  if (!vocabularyCount) {
    return 80
  }
  return clamp(Math.ceil(vocabularyCount / lessonCount), MIN_TARGET_WORD_CAPACITY, MAX_TARGET_WORD_CAPACITY)
}

function getChapterSpan(chapterSummaries) {
  const starts = []
  const ends = []
  for (const summary of chapterSummaries ?? []) {
    const start = parseChapterReference(summary?.sourceChapterStart ?? summary?.order)
    const end = parseChapterReference(summary?.sourceChapterEnd ?? summary?.order)
    if (Number.isInteger(start) && Number.isInteger(end)) {
      starts.push(start)
      ends.push(end)
    }
  }

  if (starts.length === 0) {
    return null
  }

  return { start: Math.min(...starts), end: Math.max(...ends) }
}

function findLessonsArray(value) {
  if (Array.isArray(value?.lessons)) {
    return value.lessons
  }
  if (Array.isArray(value?.outline?.lessons)) {
    return value.outline.lessons
  }
  if (Array.isArray(value?.storyOutline?.lessons)) {
    return value.storyOutline.lessons
  }
  return null
}

function normalizeChapterReferenceForOutput(value) {
  const parsed = parseChapterReference(value)
  return Number.isInteger(parsed) ? parsed : value
}

function parseChapterReference(value) {
  if (Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }

  const asciiMatch = value.match(/\d+/)
  if (asciiMatch) {
    return Number(asciiMatch[0])
  }

  const chineseMatch = value.match(/[零〇○一二两三四五六七八九十百千万亿]+/u)
  if (chineseMatch) {
    return parseChineseInteger(chineseMatch[0])
  }

  return null
}

const CHINESE_DIGITS = new Map([
  ['零', 0], ['〇', 0], ['○', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9],
])
const CHINESE_UNITS = new Map([['十', 10], ['百', 100], ['千', 1000], ['万', 10000], ['亿', 100000000]])

function parseChineseInteger(text) {
  if (!text) return null
  let total = 0
  let section = 0
  let number = 0

  for (const char of text) {
    if (CHINESE_DIGITS.has(char)) {
      number = CHINESE_DIGITS.get(char)
      continue
    }

    const unit = CHINESE_UNITS.get(char)
    if (!unit) return null

    if (unit === 10000 || unit === 100000000) {
      section = (section + (number || 0)) * unit
      total += section
      section = 0
    } else {
      section += (number || 1) * unit
    }
    number = 0
  }

  return total + section + number
}

function normalizeText(value, fallback) {
  return isNonEmptyString(value) ? value.trim() : fallback
}

function normalizeOptionalText(value) {
  return isNonEmptyString(value) ? value.trim() : undefined
}

function normalizeStringArray(value, fallback = []) {
  const values = Array.isArray(value) ? value : []
  const normalized = uniqueNonEmpty(values)
  return normalized.length ? normalized : fallback
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))]
}

function toPositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function rangeKey(start, end) {
  return `${start}-${end}`
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}
