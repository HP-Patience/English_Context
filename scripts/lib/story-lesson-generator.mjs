import { mkdir, readFile } from 'node:fs/promises'
import { validateLessonDocument } from './story-content.mjs'
import { writeJsonAtomic } from './story-outline.mjs'

export const DEFAULT_MAX_WORDS_PER_LESSON = 100
export const DEFAULT_MIN_LESSONS = 61
export const DEFAULT_MAX_LESSONS = 150

/**
 * Assign every distinct Word.text in WordGroup order to outline lessons.
 *
 * @param {{ wordGroups: unknown[], outline: { lessons: unknown[] }|unknown[], maxWordsPerLesson?: number }} options
 * @returns {{ assignments: Array<{ lessonOrder: number, outlineLesson: object, words: object[], capacity: number, report: object }>, unassignedWords: object[], report: object }}
 */
export function assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON }) {
  if (!Array.isArray(wordGroups)) {
    throw new TypeError('assignWordsToOutline requires wordGroups array')
  }
  const lessons = normalizeOutlineLessons(outline)
  const hardCap = normalizeMaxWordsPerLesson(maxWordsPerLesson)
  const { words, duplicateWordTexts } = orderedUniqueWordsFromGroups(wordGroups)

  const assignments = lessons.map((lesson) => {
    const requestedCapacity = Number.isInteger(lesson.targetWordCapacity) ? lesson.targetWordCapacity : hardCap
    const capacity = Math.min(hardCap, Math.max(0, requestedCapacity))
    return {
      lessonOrder: lesson.order,
      outlineLesson: lesson,
      words: [],
      capacity,
      report: {
        skippedWords: [],
        reorderedWords: [],
      },
    }
  })

  let cursor = 0
  for (const assignment of assignments) {
    while (cursor < words.length && assignment.words.length < assignment.capacity) {
      assignment.words.push(words[cursor])
      cursor += 1
    }
  }

  const unassignedWords = words.slice(cursor)
  const report = {
    totalWords: words.length,
    assignedWordCount: words.length - unassignedWords.length,
    unassignedWordCount: unassignedWords.length,
    duplicateWordTexts,
    reorderedWords: [],
    skippedWords: [],
  }

  return { assignments, unassignedWords, report }
}

/**
 * Generate, structurally validate, and target-set validate a single lesson document.
 *
 * @param {{ outlineLesson: object, words: object[], previousLesson?: object|null, nextLesson?: object|null, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, maxWordsPerLesson?: number }} options
 * @returns {Promise<object>}
 */
export async function generateLesson({
  outlineLesson,
  words,
  previousLesson = null,
  nextLesson = null,
  generateJson,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
}) {
  if (!isPlainObject(outlineLesson)) {
    throw new TypeError('generateLesson requires outlineLesson')
  }
  if (!Array.isArray(words)) {
    throw new TypeError('generateLesson requires words array')
  }
  if (typeof generateJson !== 'function') {
    throw new TypeError('generateLesson requires generateJson')
  }

  const normalizedWords = normalizeAssignedWords(words)
  const prompt = createLessonPrompt({ outlineLesson, words: normalizedWords, previousLesson, nextLesson })
  const response = await generateJson(prompt, 'story-lesson')
  const validation = validateLessonDocument(response, { maxTargetWords: Math.min(normalizeMaxWordsPerLesson(maxWordsPerLesson), DEFAULT_MAX_WORDS_PER_LESSON) })

  if (!validation.ok) {
    throw new Error(`invalid generated story lesson: ${validation.errors.join('; ')}`)
  }

  assertLessonTargetsMatchAssignment(validation.value, normalizedWords)
  return validation.value
}

export function createLessonPrompt({ outlineLesson, words, previousLesson = null, nextLesson = null }) {
  const sourceChapterRange = `${outlineLesson.sourceChapterStart}-${outlineLesson.sourceChapterEnd}`
  const glossary = words.map((word, index) => ({
    order: index + 1,
    word: word.text,
    definitionCn: getWordGloss(word),
  }))

  return [
    'Generate one structured story vocabulary lesson as JSON only.',
    'Use the exact StoryLessonDocument shape:',
    '{ "title": string, "order": number, "sourceChapterStart": string, "sourceChapterEnd": string, "sourceSummary": string, "continuityNotes": string, "paragraphs": [{ "sceneTitle": string, "segments": [{ "type": "text", "value": string } | { "type": "targetWord", "word": string, "definitionCn": string, "wordOrder": number }] }] }',
    'Requirements:',
    `- source chapter range: ${sourceChapterRange}`,
    `- previous lesson continuity end: ${previousLesson?.continuityNotes ?? previousLesson?.continuityEnd ?? outlineLesson.continuityStart ?? '无；这是第一课。'}`,
    `- current plot summary: ${outlineLesson.plotSummary}`,
    `- next lesson continuity start: ${nextLesson?.continuityStart ?? nextLesson?.sourceSummary ?? '无；这是最后一课。'}`,
    '- the complete target-word list is provided below and every item is mandatory.',
    '- include one contextual Chinese gloss for every target word using the provided glossary.',
    '- no target word omitted; every target word must appear in at least one targetWord segment exactly as listed.',
    '- do not add targetWord segments for words outside the target list.',
    '- do not quote or reproduce raw novel prose; retell only from the summary/continuity information.',
    `Target words and contextual Chinese glosses JSON: ${JSON.stringify(glossary)}`,
    `Characters JSON: ${JSON.stringify(outlineLesson.characters ?? [])}`,
    `Events JSON: ${JSON.stringify(outlineLesson.events ?? [])}`,
  ].join('\n')
}

export function assertLessonTargetsMatchAssignment(lessonDocument, words) {
  const expected = new Set(normalizeAssignedWords(words).map((word) => word.text))
  const actual = new Set(collectTargetWordSegments(lessonDocument).map((segment) => segment.word.trim()))
  const missing = [...expected].filter((word) => !actual.has(word))
  const extra = [...actual].filter((word) => !expected.has(word))

  if (missing.length > 0 || extra.length > 0) {
    const parts = []
    if (missing.length > 0) parts.push(`missing target words: ${missing.join(', ')}`)
    if (extra.length > 0) parts.push(`unexpected target words: ${extra.join(', ')}`)
    throw new Error(parts.join('; '))
  }
}

export async function generateLessonsFromAssignments({
  assignments,
  generateJson,
  checkpointDir,
  existingLessonsByOrder = new Map(),
  persistLesson,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
}) {
  if (!Array.isArray(assignments)) {
    throw new TypeError('generateLessonsFromAssignments requires assignments')
  }
  if (typeof generateJson !== 'function') {
    throw new TypeError('generateLessonsFromAssignments requires generateJson')
  }

  if (checkpointDir) {
    await mkdir(checkpointDir, { recursive: true })
  }

  const generated = []
  for (const [index, assignment] of assignments.entries()) {
    const existing = existingLessonsByOrder.get(assignment.lessonOrder)
    if (existing?.status === 'ready') {
      generated.push(parseLessonContent(existing))
      continue
    }

    const previousLesson = generated[index - 1] ?? null
    const nextLesson = assignments[index + 1]?.outlineLesson ?? null
    const checkpointPath = checkpointDir ? `${checkpointDir}/lesson-${String(assignment.lessonOrder).padStart(4, '0')}.json` : null
    let lessonDocument = checkpointPath ? await readValidatedLessonCheckpoint(checkpointPath, assignment.words, maxWordsPerLesson) : null

    if (!lessonDocument) {
      lessonDocument = await generateLesson({
        outlineLesson: assignment.outlineLesson,
        words: assignment.words,
        previousLesson,
        nextLesson,
        generateJson,
        maxWordsPerLesson,
      })
      if (checkpointPath) {
        await writeJsonAtomic(checkpointPath, lessonDocument)
      }
    }

    if (persistLesson) {
      await persistLesson(lessonDocument, assignment)
    }
    generated.push(lessonDocument)
  }

  return generated
}

export function validateCorpus({
  lessons,
  allWordTexts,
  minLessons = DEFAULT_MIN_LESSONS,
  maxLessons = DEFAULT_MAX_LESSONS,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
  requireReadyStatus = true,
  expectedWordCount,
} = {}) {
  const errors = []
  const warnings = []
  const normalizedLessons = []
  if (Array.isArray(lessons)) {
    for (const [index, lesson] of lessons.entries()) {
      try {
        normalizedLessons.push(parseLessonContent(lesson))
      } catch (error) {
        normalizedLessons.push(null)
        errors.push(`lessons[${index}] contentJson is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  const expectedWords = uniqueStrings(allWordTexts ?? [])
  const expectedCount = expectedWordCount ?? expectedWords.length

  if (!Array.isArray(lessons)) {
    errors.push('lessons must be an array')
  }
  if (normalizedLessons.length < minLessons || normalizedLessons.length > maxLessons) {
    errors.push(`lesson count ${normalizedLessons.length} is outside ${minLessons}-${maxLessons}`)
  }
  if (expectedCount !== undefined && expectedWords.length !== expectedCount) {
    errors.push(`expected ${expectedCount} corpus words but loaded ${expectedWords.length}`)
  }

  const seen = new Map()
  let previousStart = null
  let previousEnd = null

  for (const [index, originalLesson] of (lessons ?? []).entries()) {
    const lesson = normalizedLessons[index]
    const path = `lessons[${index}]`
    if (lesson === null) {
      continue
    }
    const validation = validateLessonDocument(lesson, { maxTargetWords: maxWordsPerLesson })
    if (!validation.ok) {
      errors.push(`${path} invalid document: ${validation.errors.join('; ')}`)
      continue
    }

    const status = originalLesson?.status ?? lesson?.status
    if (requireReadyStatus && status !== undefined && status !== 'ready') {
      errors.push(`${path} status must be ready; received ${status}`)
    }

    const targets = collectTargetWordSegments(lesson)
    if (targets.length > maxWordsPerLesson) {
      errors.push(`${path} has ${targets.length} target words; maximum is ${maxWordsPerLesson}`)
    }
    for (const word of new Set(targets.map((segment) => segment.word.trim()))) {
      const currentCount = seen.get(word) ?? 0
      seen.set(word, currentCount + 1)
    }

    const start = parseChapterNumber(lesson.sourceChapterStart)
    const end = parseChapterNumber(lesson.sourceChapterEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      errors.push(`${path} source chapter range is not numeric`)
    } else {
      if (start > end) {
        errors.push(`${path} source chapter range is backward: ${start}-${end}`)
      }
      if (previousEnd !== null && start < previousStart) {
        errors.push(`${path} source chapter start moved backward from ${previousStart} to ${start}`)
      }
      if (previousEnd !== null && start <= previousEnd) {
        errors.push(`${path} source chapter range overlaps previous ending at ${previousEnd}`)
      }
      previousStart = start
      previousEnd = end
    }
  }

  for (const word of expectedWords) {
    if (!seen.has(word)) {
      errors.push(`missing corpus word: ${word}`)
    }
  }
  for (const [word, count] of seen.entries()) {
    if (!expectedWords.includes(word)) {
      errors.push(`unexpected corpus word: ${word}`)
    }
    if (count > 1) {
      errors.push(`duplicate corpus word placement: ${word} (${count})`)
    }
  }

  const report = {
    ok: errors.length === 0,
    errors,
    warnings,
    lessonCount: normalizedLessons.length,
    expectedWordCount: expectedWords.length,
    assignedWordCount: seen.size,
    duplicateWordCount: [...seen.values()].filter((count) => count > 1).length,
    maxWordsPerLesson,
  }
  return report
}

export function collectTargetWordSegments(lessonDocument) {
  const segments = []
  for (const paragraph of lessonDocument?.paragraphs ?? []) {
    for (const segment of paragraph?.segments ?? []) {
      if (segment?.type === 'targetWord') {
        segments.push(segment)
      }
    }
  }
  return segments
}

export function parseLessonContent(value) {
  if (typeof value?.contentJson === 'string') {
    return JSON.parse(value.contentJson)
  }
  if (isPlainObject(value?.contentJson)) {
    return value.contentJson
  }
  return value
}

async function readValidatedLessonCheckpoint(path, words, maxWordsPerLesson) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    const validation = validateLessonDocument(value, { maxTargetWords: maxWordsPerLesson })
    if (!validation.ok) return null
    assertLessonTargetsMatchAssignment(validation.value, words)
    return validation.value
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    return null
  }
}

function normalizeOutlineLessons(outline) {
  const lessons = Array.isArray(outline) ? outline : outline?.lessons
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new TypeError('outline must contain a non-empty lessons array')
  }
  return [...lessons].sort((a, b) => Number(a?.order) - Number(b?.order))
}

function orderedUniqueWordsFromGroups(wordGroups) {
  const entries = []
  for (const [groupIndex, group] of wordGroups.entries()) {
    const groupSortOrder = Number.isInteger(group?.sortOrder) ? group.sortOrder : groupIndex + 1
    const items = Array.isArray(group?.items) ? group.items : Array.isArray(group?.words) ? group.words : []
    for (const [itemIndex, item] of items.entries()) {
      const word = normalizeWordRecord(item?.word ?? item)
      if (!word) continue
      entries.push({
        groupSortOrder,
        itemSortOrder: Number.isInteger(item?.sortOrder) ? item.sortOrder : itemIndex + 1,
        word,
      })
    }
  }

  entries.sort((a, b) => a.groupSortOrder - b.groupSortOrder || a.itemSortOrder - b.itemSortOrder || a.word.text.localeCompare(b.word.text))

  const seen = new Set()
  const duplicateWordTexts = []
  const words = []
  for (const entry of entries) {
    if (seen.has(entry.word.text)) {
      duplicateWordTexts.push(entry.word.text)
      continue
    }
    seen.add(entry.word.text)
    words.push({
      ...entry.word,
      groupSortOrder: entry.groupSortOrder,
      itemSortOrder: entry.itemSortOrder,
    })
  }
  return { words, duplicateWordTexts }
}

function normalizeAssignedWords(words) {
  return words.map((word, index) => {
    const normalized = normalizeWordRecord(word)
    if (!normalized) {
      throw new Error(`words[${index}] must contain a non-empty text field`)
    }
    return normalized
  })
}

function normalizeWordRecord(word) {
  if (!isPlainObject(word) || !isNonEmptyString(word.text)) {
    return null
  }
  const meaning = chooseMeaning(word)
  return {
    ...word,
    text: word.text.trim(),
    meaning,
    definitionCn: word.definitionCn ?? meaning?.definitionCn,
  }
}

function chooseMeaning(word) {
  if (isPlainObject(word.meaning)) return word.meaning
  if (isPlainObject(word.selectedMeaning)) return word.selectedMeaning
  if (Array.isArray(word.meanings) && word.meanings.length > 0) {
    return word.meanings.find((meaning) => isNonEmptyString(meaning?.definitionCn)) ?? word.meanings[0]
  }
  return undefined
}

function getWordGloss(word) {
  const gloss = word.definitionCn ?? word.meaning?.definitionCn ?? word.meaning?.definition
  if (!isNonEmptyString(gloss)) {
    throw new Error(`word ${word.text} is missing a contextual Chinese gloss`)
  }
  return gloss.trim()
}

function uniqueStrings(values) {
  const result = []
  const seen = new Set()
  for (const value of values) {
    if (!isNonEmptyString(value)) continue
    const trimmed = value.trim()
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function normalizeMaxWordsPerLesson(value) {
  if (!Number.isInteger(value) || value < 1 || value > DEFAULT_MAX_WORDS_PER_LESSON) {
    throw new TypeError(`maxWordsPerLesson must be an integer between 1 and ${DEFAULT_MAX_WORDS_PER_LESSON}`)
  }
  return value
}

function parseChapterNumber(value) {
  if (Number.isInteger(value)) return value
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value !== 'string') return null
  const asciiMatch = value.match(/\d+/)
  if (asciiMatch) return Number(asciiMatch[0])
  const chineseMatch = value.match(/[零〇○一二两三四五六七八九十百千万亿]+/u)
  return chineseMatch ? parseChineseInteger(chineseMatch[0]) : null
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
