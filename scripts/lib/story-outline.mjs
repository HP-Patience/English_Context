import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fingerprintValue } from './input-fingerprint.mjs'
import { validateSourceIndexCoverage } from './story-source-coverage.mjs'

export const DEFAULT_CHAPTER_BATCH_SIZE = 25
export const MIN_LESSON_COUNT = 61
export const TARGET_MIN_LESSON_COUNT = 80
export const TARGET_MAX_LESSON_COUNT = 100
export const MAX_LESSON_COUNT = 150
export const MIN_TARGET_WORD_CAPACITY = 40
export const MAX_TARGET_WORD_CAPACITY = 100
export const DEFAULT_LLM_GENERATION_ATTEMPTS = 3

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
 * Chapter objects may include transient `text` bodies. Text is included in prompts
 * for summarization quality, but never written to checkpoints.
 *
 * @param {{ chapters: Array<{ order: number, title: string, characterCount?: number, text?: string }>, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, checkpointPath: string, chapterBatchSize?: number }} options
 * @returns {Promise<ChapterSummary[]>}
 */
export async function buildChapterSummaries({
  chapters,
  generateJson,
  checkpointPath,
  chapterBatchSize = DEFAULT_CHAPTER_BATCH_SIZE,
  sourceFingerprint,
}) {
  if (!Array.isArray(chapters) || chapters.length === 0) throw new Error('buildChapterSummaries requires a non-empty chapters array')
  if (typeof generateJson !== 'function') throw new TypeError('buildChapterSummaries requires generateJson')
  if (!checkpointPath) throw new TypeError('buildChapterSummaries requires checkpointPath')
  if (!Number.isInteger(chapterBatchSize) || chapterBatchSize < 1) throw new TypeError('chapterBatchSize must be a positive integer')

  const orderedChapters = normalizeChaptersStrict(chapters)
  const resolvedSourceFingerprint = sourceFingerprint ?? fingerprintValue(orderedChapters)
  const batches = chunk(orderedChapters, chapterBatchSize)
  const batchFingerprints = new Map(batches.map((batch) => [rangeKey(batch[0].order, batch[batch.length - 1].order), fingerprintValue({ sourceFingerprint: resolvedSourceFingerprint, batch })]))
  const expectedRanges = new Set(batchFingerprints.keys())
  const checkpointInputFingerprint = fingerprintValue({ sourceFingerprint: resolvedSourceFingerprint, chapterBatchSize, batchFingerprints: [...batchFingerprints.values()] })
  const checkpoint = await readJsonIfExists(checkpointPath)
  const summariesByRange = new Map()

  if (checkpoint !== null) {
    if (!isPlainObject(checkpoint) || checkpoint.version !== 2 || !Array.isArray(checkpoint.summaries)) {
      throw new Error('malformed chapter summary checkpoint: expected fingerprint-bound version 2 with summaries array')
    }
    if (checkpoint.sourceFingerprint !== resolvedSourceFingerprint || checkpoint.chapterBatchSize !== chapterBatchSize || checkpoint.inputFingerprint !== checkpointInputFingerprint) {
      throw new Error('chapter summary checkpoint source/batch fingerprint does not match current input')
    }
    for (const [summaryIndex, summary] of checkpoint.summaries.entries()) {
      const normalized = parseStoredChapterSummaryStrict(summary, `checkpoint.summaries[${summaryIndex}]`)
      const key = rangeKey(normalized.sourceChapterStart, normalized.sourceChapterEnd)
      if (!expectedRanges.has(key)) throw new Error(`malformed chapter summary checkpoint: range ${key} is not an expected chapter batch`)
      if (summary.inputFingerprint !== batchFingerprints.get(key)) throw new Error(`chapter summary checkpoint batch fingerprint mismatch for range ${key}`)
      summariesByRange.set(key, { ...normalized, inputFingerprint: summary.inputFingerprint })
    }
  }

  const summaries = []
  for (const [batchIndex, batch] of batches.entries()) {
    const startOrder = batch[0].order
    const endOrder = batch[batch.length - 1].order
    const key = rangeKey(startOrder, endOrder)
    let summary = summariesByRange.get(key)
    if (!summary) {
      const prompt = createChapterSummaryPrompt({ batch, batchIndex, batchCount: batches.length })
      summary = {
        ...await generateParsedJsonWithRetries({
          prompt,
          schemaName: 'chapter-summary',
          generateJson,
          parse: (response) => parseGeneratedChapterSummaryStrict(response, { batch, batchIndex }),
        }),
        inputFingerprint: batchFingerprints.get(key),
      }
      summariesByRange.set(key, summary)
      await writeJsonAtomic(checkpointPath, {
        version: 2,
        sourceFingerprint: resolvedSourceFingerprint,
        chapterBatchSize,
        inputFingerprint: checkpointInputFingerprint,
        generatedAt: new Date().toISOString(),
        summaries: batches.map((candidateBatch) => summariesByRange.get(rangeKey(candidateBatch[0].order, candidateBatch[candidateBatch.length - 1].order))).filter(Boolean),
      })
    }
    summaries.push(summary)
  }
  return summaries
}

/**
 * Build and validate a continuity-aware lesson outline, resuming a valid final checkpoint.
 *
 * @param {{ chapterSummaries: ChapterSummary[], vocabularyCount: number, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, checkpointPath: string, allowDeterministicFallback?: boolean }} options
 * @returns {Promise<StoryOutline>}
 */
export async function buildStoryOutline({
  chapterSummaries,
  vocabularyCount,
  generateJson,
  checkpointPath,
  allowDeterministicFallback = false,
  sourceFingerprint,
  sourceChapters,
}) {
  if (!Array.isArray(chapterSummaries) || chapterSummaries.length === 0) throw new Error('buildStoryOutline requires a non-empty chapterSummaries array')
  if (!Number.isInteger(vocabularyCount) || vocabularyCount < 0) throw new TypeError('vocabularyCount must be a non-negative integer')
  if (typeof generateJson !== 'function') throw new TypeError('buildStoryOutline requires generateJson')
  if (!checkpointPath) throw new TypeError('buildStoryOutline requires checkpointPath')

  const normalizedSummaries = chapterSummaries.map((summary, index) => parseStoredChapterSummaryStrict(summary, `chapterSummaries[${index}]`))
  const summaryFingerprint = fingerprintValue(normalizedSummaries)
  const resolvedSourceFingerprint = sourceFingerprint ?? fingerprintValue(normalizedSummaries.map(({ sourceChapterStart, sourceChapterEnd }) => ({ sourceChapterStart, sourceChapterEnd })))
  const inputFingerprint = fingerprintValue({ sourceFingerprint: resolvedSourceFingerprint, summaryFingerprint, vocabularyCount })
  const existing = await readJsonIfExists(checkpointPath)
  if (existing !== null) {
    if (!isPlainObject(existing) || existing.version !== 2 || !Array.isArray(existing.lessons)) throw new Error('malformed story outline checkpoint: expected fingerprint-bound version 2 with lessons array')
    if (existing.inputFingerprint !== inputFingerprint || existing.summaryFingerprint !== summaryFingerprint || existing.sourceFingerprint !== resolvedSourceFingerprint) {
      throw new Error('story outline checkpoint summary/input fingerprint does not match current input')
    }
    const parsedExisting = parseStoryOutlineStrict(existing, { vocabularyCount, generatedAt: existing.generatedAt, metadata: existing })
    validateStoryOutline(parsedExisting, normalizedSummaries, { sourceChapters })
    return parsedExisting
  }

  const prompt = createStoryOutlinePrompt({ chapterSummaries: normalizedSummaries, vocabularyCount })
  const parsed = await generateParsedJsonWithRetries({
    prompt,
    schemaName: 'story-outline',
    generateJson,
    parse: (response) => (allowDeterministicFallback && !findLessonsArray(response)
      ? createDeterministicStoryOutline({ chapterSummaries: normalizedSummaries, vocabularyCount })
      : parseStoryOutlineStrict(response, { vocabularyCount })),
  })
  const outline = {
    ...parsed,
    version: 2,
    sourceFingerprint: resolvedSourceFingerprint,
    summaryFingerprint,
    inputFingerprint,
  }
  validateStoryOutline(outline, normalizedSummaries, { sourceChapters })
  await writeJsonAtomic(checkpointPath, outline)
  return outline
}

export function createChapterSummaryPrompt({ batch, batchIndex, batchCount }) {
  const start = batch[0].order
  const end = batch[batch.length - 1].order
  const chaptersForPrompt = batch.map(({ order, title, characterCount, text }) => ({
    order,
    title,
    characterCount,
    text: typeof text === 'string' ? text : '',
  }))

  return [
    `Summarize source chapters ${start}-${end} for a continuous main-line retelling outline.`,
    `This is batch ${batchIndex + 1} of ${batchCount}. Use the provided chapter body text for plot, causality, characters, and continuity.`,
    'Return JSON with exactly: summary (non-empty string), characters (string[]), events (string[]), optional continuityStart, optional continuityEnd.',
    'Language requirement: write every narrative value in Simplified Chinese (简体中文), including summary, characters, events, continuityStart, and continuityEnd. Do not translate the story summary into English.',
    'Keep chronological order. Capture plot-significant main-line developments; omit filler and do not quote or reproduce raw source prose.',
    'Chapter bodies are transient prompt input only and must not be persisted in checkpoints or output.',
    'Chapter input JSON:',
    JSON.stringify(chaptersForPrompt),
  ].join('\n')
}

export function createStoryOutlinePrompt({ chapterSummaries, vocabularyCount }) {
  const targetLessonCount = chooseTargetLessonCount({ chapterSpan: getChapterSpan(chapterSummaries), vocabularyCount })
  const capacityHint = chooseTargetWordCapacity({ vocabularyCount, lessonCount: targetLessonCount })

  return [
    'Create a continuity-aware 61-150 lesson outline for a full continuous main-line retelling.',
    `Target ${TARGET_MIN_LESSON_COUNT}-${TARGET_MAX_LESSON_COUNT} lessons when possible; never exceed ${MAX_LESSON_COUNT}. Suggested lesson count: ${targetLessonCount}.`,
    'Every lesson must be in chronological ordering with explicit source chapter ranges and no overlap or gaps.',
    'The first lesson must start at the first available source chapter and the final lesson must end at the last available source chapter exactly; do not invent before/after ranges.',
    'Each lesson needs a continuity handoff: continuityStart says what state it receives, continuityEnd says what state it passes to the next lesson.',
    `Set targetWordCapacity between ${MIN_TARGET_WORD_CAPACITY} and ${MAX_TARGET_WORD_CAPACITY}; suggested value ${capacityHint}.`,
    `Vocabulary count to distribute: ${vocabularyCount}.`,
    'Return JSON object: { "lessons": [{ "order", "sourceChapterStart", "sourceChapterEnd", "plotSummary", "characters", "events", "continuityStart", "continuityEnd", "targetWordCapacity" }] }.',
    'Language requirement: write every narrative value in Simplified Chinese (简体中文), including plotSummary, characters, events, continuityStart, and continuityEnd. Do not translate the outline into English.',
    'Use only these checkpointed summaries; do not invent raw prose or quote source text.',
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

export function validateStoryOutline(outline, chapterSummaries = [], { sourceChapters } = {}) {
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

    const expectedSpan = getChapterSpan(chapterSummaries)
    const totalCapacity = outline.lessons.reduce((total, lesson) => total + (Number.isInteger(lesson?.targetWordCapacity) ? lesson.targetWordCapacity : 0), 0)
    if (Number.isInteger(outline.vocabularyCount) && totalCapacity < outline.vocabularyCount) {
      errors.push(`outline target-word capacity ${totalCapacity} cannot cover vocabularyCount ${outline.vocabularyCount}`)
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
        if (!Array.isArray(lesson[field]) || lesson[field].length === 0 || lesson[field].some((value) => !isNonEmptyString(value))) {
          errors.push(`${path}.${field} must be a non-empty array of non-empty strings`)
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

      if ((!Array.isArray(sourceChapters) || sourceChapters.length === 0) && previousEnd !== null && start > previousEnd + 1) {
        errors.push(`${path} leaves a gap after chapter ${previousEnd}`)
      }

      if (expectedSpan && (start < expectedSpan.start || end > expectedSpan.end)) {
        errors.push(`${path} range ${start}-${end} is outside available source span ${expectedSpan.start}-${expectedSpan.end}`)
      }

      previousEnd = end
    }

    if (Array.isArray(sourceChapters) && sourceChapters.length > 0) {
      errors.push(...validateSourceIndexCoverage({ lessons: outline.lessons, sourceChapters, label: 'lessons' }))
    }

    if (expectedSpan && outline.lessons.length > 0) {
      const first = outline.lessons[0]
      const last = outline.lessons[outline.lessons.length - 1]
      const firstStart = parseChapterReference(first?.sourceChapterStart)
      const lastEnd = parseChapterReference(last?.sourceChapterEnd)
      if (firstStart !== expectedSpan.start) {
        errors.push(`outline starts at chapter ${firstStart}; expected exact first source chapter ${expectedSpan.start}`)
      }
      if (lastEnd !== expectedSpan.end) {
        errors.push(`outline ends at chapter ${lastEnd}; expected exact last source chapter ${expectedSpan.end}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid story outline: ${errors.join('; ')}`)
  }

  return outline
}

export function createDeterministicStoryOutline({ chapterSummaries, vocabularyCount }) {
  const parsedSummaries = chapterSummaries.map((summary, index) => parseStoredChapterSummaryStrict(summary, `chapterSummaries[${index}]`))
  const span = getChapterSpan(parsedSummaries)
  const chapterCount = span.end - span.start + 1
  const lessonCount = chooseTargetLessonCount({ chapterSpan: span, vocabularyCount })
  const targetWordCapacity = chooseTargetWordCapacity({ vocabularyCount, lessonCount })
  const lessons = []

  for (let index = 0; index < lessonCount; index += 1) {
    const start = span.start + Math.floor((index * chapterCount) / lessonCount)
    const end = span.start + Math.floor(((index + 1) * chapterCount) / lessonCount) - 1
    const clampedEnd = Math.max(start, end)
    const coveredSummaries = parsedSummaries.filter((summary) => summary.sourceChapterStart <= clampedEnd && summary.sourceChapterEnd >= start)
    const characters = uniqueNonEmpty(coveredSummaries.flatMap((summary) => summary.characters)).slice(0, 8)
    const events = uniqueNonEmpty(coveredSummaries.flatMap((summary) => summary.events)).slice(0, 10)
    const plotSummary = coveredSummaries.map((summary) => summary.summary).filter(Boolean).join('；')

    lessons.push({
      order: index + 1,
      sourceChapterStart: start,
      sourceChapterEnd: clampedEnd,
      plotSummary,
      characters,
      events,
      continuityStart: index === 0 ? '主线从开篇状态开始。' : `承接第${index}课结束时的人物关系与冲突。`,
      continuityEnd: index === lessonCount - 1 ? '本阶段主线完整收束。' : `主要冲突推进到第${index + 2}课继续。`,
      targetWordCapacity,
    })
  }

  const outline = {
    generatedAt: new Date().toISOString(),
    lessonCount: lessons.length,
    vocabularyCount,
    lessons,
  }
  validateStoryOutline(outline, parsedSummaries)
  return outline
}


async function generateParsedJsonWithRetries({ prompt, schemaName, generateJson, parse, attempts = DEFAULT_LLM_GENERATION_ATTEMPTS }) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const retryPrompt = attempt === 1 ? prompt : [
      prompt,
      '',
      `Previous ${schemaName} response was rejected: ${lastError?.message ?? String(lastError)}.`,
      'Regenerate the full JSON from scratch. Follow every schema and language requirement exactly, especially Simplified Chinese (简体中文) narrative fields. Return only valid JSON.',
    ].join('\n')

    const response = await generateJson(retryPrompt, schemaName)
    try {
      return parse(response)
    } catch (error) {
      lastError = error
      if (attempt === attempts) {
        throw error
      }
    }
  }

  throw lastError ?? new Error(`${schemaName} generation failed`)
}

function normalizeChaptersStrict(chapters) {
  const normalized = chapters.map((chapter, index) => {
    if (!isPlainObject(chapter)) {
      throw new Error(`chapters[${index}] must be an object`)
    }
    const order = Number(chapter.order)
    if (!Number.isInteger(order) || order < 1) {
      throw new Error(`chapters[${index}].order must be a positive integer`)
    }
    if (!isNonEmptyString(chapter.title)) {
      throw new Error(`chapters[${index}].title must be a non-empty string`)
    }

    return {
      order,
      title: chapter.title.trim(),
      characterCount: Number.isFinite(Number(chapter.characterCount)) ? Number(chapter.characterCount) : undefined,
      text: typeof chapter.text === 'string' ? chapter.text : undefined,
    }
  }).sort((a, b) => a.order - b.order)

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].order <= normalized[index - 1].order) {
      throw new Error(`chapters must have unique ascending order; duplicate/backward order ${normalized[index].order}`)
    }
  }

  return normalized
}

function parseGeneratedChapterSummaryStrict(response, { batch, batchIndex }) {
  const start = batch[0].order
  const end = batch[batch.length - 1].order
  const candidate = Array.isArray(response?.summaries) ? response.summaries[0]
    : Array.isArray(response?.chapterSummaries) ? response.chapterSummaries[0]
      : response
  const errors = []

  if (!isPlainObject(candidate)) {
    throw new Error(`invalid chapter-summary response for ${start}-${end}: expected object`)
  }

  const summary = requireNonEmptyString(candidate.summary, 'summary', errors)
  const characters = requireStringArray(candidate.characters, 'characters', errors)
  const events = requireStringArray(candidate.events, 'events', errors)
  const continuityStart = optionalNonEmptyString(candidate.continuityStart, 'continuityStart', errors)
  const continuityEnd = optionalNonEmptyString(candidate.continuityEnd, 'continuityEnd', errors)

  requireSimplifiedChineseText(summary, 'summary', errors)
  requireSimplifiedChineseStringArray(characters, 'characters', errors)
  requireSimplifiedChineseStringArray(events, 'events', errors)
  requireSimplifiedChineseText(continuityStart, 'continuityStart', errors)
  requireSimplifiedChineseText(continuityEnd, 'continuityEnd', errors)

  if (errors.length > 0) {
    throw new Error(`invalid chapter-summary response for ${start}-${end}: ${errors.join('; ')}`)
  }

  return withoutUndefined({
    order: batchIndex + 1,
    sourceChapterStart: start,
    sourceChapterEnd: end,
    summary,
    characters,
    events,
    continuityStart,
    continuityEnd,
  })
}

function parseStoredChapterSummaryStrict(summary, path) {
  const errors = []
  if (!isPlainObject(summary)) {
    throw new Error(`${path} must be an object`)
  }

  const order = Number(summary.order)
  if (!Number.isInteger(order) || order < 1) {
    errors.push('order must be a positive integer')
  }

  const sourceChapterStart = parseChapterReference(summary.sourceChapterStart)
  const sourceChapterEnd = parseChapterReference(summary.sourceChapterEnd)
  if (!Number.isInteger(sourceChapterStart) || !Number.isInteger(sourceChapterEnd)) {
    errors.push('sourceChapterStart/sourceChapterEnd must identify numeric chapters')
  } else if (sourceChapterStart > sourceChapterEnd) {
    errors.push('source chapter range must not be backward')
  }

  const parsed = {
    order,
    sourceChapterStart,
    sourceChapterEnd,
    summary: requireNonEmptyString(summary.summary, 'summary', errors),
    characters: requireStringArray(summary.characters, 'characters', errors),
    events: requireStringArray(summary.events, 'events', errors),
    continuityStart: optionalNonEmptyString(summary.continuityStart, 'continuityStart', errors),
    continuityEnd: optionalNonEmptyString(summary.continuityEnd, 'continuityEnd', errors),
  }

  requireSimplifiedChineseText(parsed.summary, 'summary', errors)
  requireSimplifiedChineseStringArray(parsed.characters, 'characters', errors)
  requireSimplifiedChineseStringArray(parsed.events, 'events', errors)
  requireSimplifiedChineseText(parsed.continuityStart, 'continuityStart', errors)
  requireSimplifiedChineseText(parsed.continuityEnd, 'continuityEnd', errors)

  if (errors.length > 0) {
    throw new Error(`invalid chapter summary at ${path}: ${errors.join('; ')}`)
  }

  return withoutUndefined(parsed)
}

function parseStoryOutlineStrict(value, { vocabularyCount, generatedAt = new Date().toISOString(), metadata = value }) {
  const lessonsInput = findLessonsArray(value)
  if (!Array.isArray(lessonsInput)) {
    throw new Error('invalid story-outline response: lessons must be an array')
  }

  const lessons = lessonsInput.map((lesson, index) => parseStoryLessonStrict(lesson, index))
  return withoutUndefined({
    version: metadata?.version,
    generatedAt,
    lessonCount: lessons.length,
    vocabularyCount,
    sourceFingerprint: metadata?.sourceFingerprint,
    summaryFingerprint: metadata?.summaryFingerprint,
    inputFingerprint: metadata?.inputFingerprint,
    lessons,
  })
}

function parseStoryLessonStrict(lesson, index) {
  const errors = []
  const path = `lessons[${index}]`
  if (!isPlainObject(lesson)) {
    throw new Error(`${path} must be an object`)
  }

  const order = Number(lesson.order)
  if (!Number.isInteger(order) || order < 1) {
    errors.push('order must be a positive integer')
  }

  const sourceChapterStart = parseChapterReference(lesson.sourceChapterStart)
  const sourceChapterEnd = parseChapterReference(lesson.sourceChapterEnd)
  if (!Number.isInteger(sourceChapterStart) || !Number.isInteger(sourceChapterEnd)) {
    errors.push('sourceChapterStart/sourceChapterEnd must identify numeric chapters')
  }

  const targetWordCapacity = Number(lesson.targetWordCapacity)
  if (!Number.isInteger(targetWordCapacity)) {
    errors.push('targetWordCapacity must be an integer')
  }

  const parsed = {
    order,
    sourceChapterStart,
    sourceChapterEnd,
    plotSummary: requireNonEmptyString(lesson.plotSummary, 'plotSummary', errors),
    characters: requireStringArray(lesson.characters, 'characters', errors),
    events: requireStringArray(lesson.events, 'events', errors),
    continuityStart: requireNonEmptyString(lesson.continuityStart, 'continuityStart', errors),
    continuityEnd: requireNonEmptyString(lesson.continuityEnd, 'continuityEnd', errors),
    targetWordCapacity,
  }

  requireSimplifiedChineseText(parsed.plotSummary, 'plotSummary', errors)
  requireSimplifiedChineseStringArray(parsed.characters, 'characters', errors)
  requireSimplifiedChineseStringArray(parsed.events, 'events', errors)
  requireSimplifiedChineseText(parsed.continuityStart, 'continuityStart', errors)
  requireSimplifiedChineseText(parsed.continuityEnd, 'continuityEnd', errors)

  if (errors.length > 0) {
    throw new Error(`invalid story outline lesson at ${path}: ${errors.join('; ')}`)
  }

  return parsed
}


function requireSimplifiedChineseStringArray(values, field, errors) {
  if (!Array.isArray(values)) {
    return
  }
  values.forEach((value, index) => requireSimplifiedChineseText(value, `${field}[${index}]`, errors))
}

function requireSimplifiedChineseText(value, field, errors) {
  if (value === undefined || value === null) {
    return
  }
  if (typeof value !== 'string') {
    return
  }

  const text = value.trim()
  if (!text) {
    return
  }

  const cjkCount = (text.match(/[㐀-鿿]/gu) ?? []).length
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length
  if (cjkCount === 0) {
    errors.push(`${field} must be written in Simplified Chinese (简体中文)`)
    return
  }

  if (latinCount >= 20 && latinCount > cjkCount * 2) {
    errors.push(`${field} must be predominantly Simplified Chinese (简体中文), not English`)
  }
}

function requireNonEmptyString(value, field, errors) {
  if (!isNonEmptyString(value)) {
    errors.push(`${field} must be a non-empty string`)
    return undefined
  }
  return value.trim()
}

function optionalNonEmptyString(value, field, errors) {
  if (value === undefined || value === null) {
    return undefined
  }
  if (!isNonEmptyString(value)) {
    errors.push(`${field} must be omitted or a non-empty string`)
    return undefined
  }
  return value.trim()
}

function requireStringArray(value, field, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array of non-empty strings`)
    return undefined
  }

  const normalized = uniqueNonEmpty(value)
  if (normalized.length !== value.length) {
    errors.push(`${field} must contain only non-empty strings`)
    return undefined
  }
  return normalized
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
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

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))]
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