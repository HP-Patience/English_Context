import { mkdir, readFile } from 'node:fs/promises'
import { validateLessonDocument } from './story-content.mjs'
import { writeJsonAtomic } from './story-outline.mjs'
import { fingerprintValue } from './input-fingerprint.mjs'
import { validateSourceIndexCoverage } from './story-source-coverage.mjs'

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
 * @param {{ outlineLesson: object, words: object[], previousLesson?: object|null, nextLesson?: object|null, generateJson: (prompt: string, schemaName?: string) => Promise<unknown>, maxWordsPerLesson?: number, promptOverride?: string }} options
 * @returns {Promise<object>}
 */
export async function generateLesson({
  outlineLesson,
  words,
  previousLesson = null,
  nextLesson = null,
  generateJson,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
  promptOverride,
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
  const prompt = typeof promptOverride === 'string' && promptOverride.trim()
    ? promptOverride
    : createLessonPrompt({ outlineLesson, words: normalizedWords, previousLesson, nextLesson })
  const response = await generateJson(prompt, 'story-lesson')
  const validation = validateLessonDocument(response, { maxTargetWords: Math.min(normalizeMaxWordsPerLesson(maxWordsPerLesson), DEFAULT_MAX_WORDS_PER_LESSON) })

  if (!validation.ok) {
    throw new Error(`invalid generated story lesson: ${validation.errors.join('; ')}`)
  }

  assertLessonTargetsMatchAssignment(validation.value, normalizedWords, outlineLesson)
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
    '{ "title": string, "order": number, "sourceChapterStart": string, "sourceChapterEnd": string, "sourceSummary": string, "continuityNotes": string, "paragraphs": [{ "sceneTitle": string, "segments": [{ "type": "text", "value": string } | { "type": "targetWord", "word": string, "definitionCn": string, "phonetic": string, "wordOrder": number }] }] }',
    'Requirements:',
    `- source chapter range: ${sourceChapterRange}`,
    `- previous lesson continuity end: ${previousLesson?.continuityNotes ?? previousLesson?.continuityEnd ?? outlineLesson.continuityStart ?? '无；这是第一课。'}`,
    `- current plot summary: ${outlineLesson.plotSummary}`,
    `- next lesson continuity start: ${nextLesson?.continuityStart ?? nextLesson?.sourceSummary ?? '无；这是最后一课。'}`,
    '- the complete target-word list is provided below and every item is mandatory.',
    '- write title, sourceSummary, continuityNotes, sceneTitle, and all text segments as Simplified Chinese (简体中文) narrative text; only targetWord.word and phonetic stay as the required English/IPA values.',
    '- the story text must be concrete scene narration, not commentary, moralizing, lesson notes, or structural explanation.',
    '- preserve the supplied outline plot exactly: do not change the main events, character relationships, chapter order, outcome, setting, or causality.',
    '- you may add only small connective actions, inner thoughts, sensory details, and transition sentences needed to embed target words naturally; these details must not create new plot points.',
    '- do not introduce modern objects, organizations, technologies, diseases, institutions, or worldbuilding that are not implied by the outline; if an abstract/modern target word is hard to fit, use it as metaphor, judgment, label, or inner comparison without changing the story world.',
    '- do not use template filler such as “这一处…”, “这一句…”, “这一点…”, “这一层…”, or “后半段收束”.',
    '- do not write sentences about the reader, the structure of the lesson, or how the passage functions; write the plot itself.',
    '- include one contextual Chinese gloss for every target word using the provided glossary.',
    '- targetWord segments are inline annotations inside the Chinese story, not flashcard chips or a vocabulary list.',
    '- NEVER place two targetWord segments next to each other. Between any two targetWord segments in the same paragraph, write at least 8 Simplified Chinese story characters that continue the plot.',
    '- Do not dump target words in clusters at the beginning or end of a sentence. Each targetWord must be attached to a concrete narrated action, object, judgment, conflict, or consequence.',
    '- Good segment rhythm example: text “他决定先” + targetWord “advance” + text “一步试探寨中长老的反应，又用更” + targetWord “advanced” + text “的前世经验压住心里的波澜。”',
    '- Bad segment rhythm example: targetWord “advance” + targetWord “advanced” + targetWord “agent” + text “前世五百年的记忆还在。”',
    '- FORMAT ONE-SHOT ONLY; do not copy these sample words unless they are in the provided target list: {"sceneTitle":"重生初醒","segments":[{"type":"text","value":"方源醒来时没有立刻"},{"type":"targetWord","word":"react","definitionCn":"反应","phonetic":"/riˈækt/","wordOrder":1},{"type":"text","value":"，他先压住呼吸，确认木屋、竹床和窗外山影都是真实存在的"},{"type":"targetWord","word":"actual","definitionCn":"实际的，真实的","phonetic":"/ˈæktʃuəl/","wordOrder":2},{"type":"text","value":"处境。前世记忆像暗线一样回到脑中，他决定先向前"},{"type":"targetWord","word":"advance","definitionCn":"前进","phonetic":"/ədˈvæns/","wordOrder":3},{"type":"text","value":"一步，借少年身份遮住锋芒，再用更老辣的"},{"type":"targetWord","word":"advanced","definitionCn":"先进的","phonetic":"/ədˈvænst/","wordOrder":4},{"type":"text","value":"经验判断族人的每一次试探。"}]}',
    '- enrich every targetWord segment with one required non-empty phonetic value in canonical IPA; never use a placeholder or omit it.',
    '- no target word omitted; every target word must appear in at least one targetWord segment exactly as listed.',
    '- do not add targetWord segments for words outside the target list.',
    '- do not quote or reproduce raw novel prose; retell only from the summary/continuity information.',
    `Target words and contextual Chinese glosses JSON: ${JSON.stringify(glossary)}`,
    `Characters JSON: ${JSON.stringify(outlineLesson.characters ?? [])}`,
    `Events JSON: ${JSON.stringify(outlineLesson.events ?? [])}`,
  ].join('\n')
}

export function assertLessonTargetsMatchAssignment(lessonDocument, words, outlineLesson = null) {
  const expectedWords = normalizeAssignedWords(words)
  const targetSegments = collectTargetWordSegments(lessonDocument)
  const errors = []

  if (outlineLesson) {
    if (lessonDocument.order !== outlineLesson.order) {
      errors.push(`lesson order ${lessonDocument.order} does not match outline order ${outlineLesson.order}`)
    }
    if (String(lessonDocument.sourceChapterStart) !== String(outlineLesson.sourceChapterStart)) {
      errors.push(`sourceChapterStart ${lessonDocument.sourceChapterStart} does not match outline sourceChapterStart ${outlineLesson.sourceChapterStart}`)
    }
    if (String(lessonDocument.sourceChapterEnd) !== String(outlineLesson.sourceChapterEnd)) {
      errors.push(`sourceChapterEnd ${lessonDocument.sourceChapterEnd} does not match outline sourceChapterEnd ${outlineLesson.sourceChapterEnd}`)
    }
  }

  if (targetSegments.length !== expectedWords.length) {
    errors.push(`target segment count ${targetSegments.length} does not match assigned word count ${expectedWords.length}`)
  }

  const seenWords = new Set()
  for (const [index, segment] of targetSegments.entries()) {
    const displayIndex = index + 1
    if (seenWords.has(segment.word)) {
      errors.push(`duplicate target word segment: ${segment.word}`)
    }
    seenWords.add(segment.word)

    const expected = expectedWords[index]
    if (!expected) {
      errors.push(`unexpected target word at segment ${displayIndex}: ${segment.word}`)
      continue
    }

    if (segment.word !== expected.text) {
      errors.push(`target segment ${displayIndex} word ${segment.word} does not match assigned word ${expected.text}`)
    }
    if (segment.wordOrder !== displayIndex) {
      errors.push(`target segment ${displayIndex} wordOrder ${segment.wordOrder} does not match expected contiguous wordOrder ${displayIndex}`)
    }
    const expectedGloss = getWordGloss(expected)
    if (segment.definitionCn !== expectedGloss) {
      errors.push(`target segment ${displayIndex} gloss ${segment.definitionCn} does not match assigned gloss ${expectedGloss}`)
    }
  }

  for (const expected of expectedWords) {
    if (!seenWords.has(expected.text)) {
      errors.push(`missing target words: ${expected.text}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}


export async function generateLessonsFromAssignments({
  assignments,
  generateJson,
  checkpointDir,
  existingLessonsByOrder = new Map(),
  persistLesson,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
  progressPath,
  progressMetadata = {},
  writeProgressJson = writeJsonAtomic,
  now = () => new Date(),
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

  const firstNonReadyIndex = assignments.findIndex((assignment) => existingLessonsByOrder.get(assignment.lessonOrder)?.status !== 'ready')
  const regenerateFromIndex = firstNonReadyIndex === -1 ? assignments.length : firstNonReadyIndex
  const generated = []
  const progress = createLessonGenerationProgressTracker({
    progressPath,
    totalLessons: assignments.length,
    assignments,
    metadata: progressMetadata,
    writeJson: writeProgressJson,
    now,
  })

  try {
    for (let index = 0; index < regenerateFromIndex; index += 1) {
      const existing = existingLessonsByOrder.get(assignments[index].lessonOrder)
      generated.push(parseLessonContent(existing))
    }

    await progress.write({
      status: regenerateFromIndex >= assignments.length ? 'completed' : 'running',
      completedLessons: generated.length,
      currentAssignment: assignments[regenerateFromIndex] ?? null,
      lastCompletedLesson: generated[generated.length - 1] ?? null,
      finished: regenerateFromIndex >= assignments.length,
    })

    for (let index = regenerateFromIndex; index < assignments.length; index += 1) {
      const assignment = assignments[index]
      await progress.write({
        status: 'running',
        completedLessons: generated.length,
        currentAssignment: assignment,
        lastCompletedLesson: generated[generated.length - 1] ?? null,
      })

      const previousLesson = generated[index - 1] ?? null
      const nextLesson = assignments[index + 1]?.outlineLesson ?? null
      const checkpointPath = checkpointDir ? `${checkpointDir}/lesson-${String(assignment.lessonOrder).padStart(4, '0')}.json` : null
      const inputFingerprint = createLessonInputFingerprint(assignment)
      const priorContinuityFingerprint = createPriorContinuityFingerprint(previousLesson)
      let lessonDocument = checkpointPath ? await readValidatedLessonCheckpoint({
        path: checkpointPath,
        outlineLesson: assignment.outlineLesson,
        words: assignment.words,
        maxWordsPerLesson,
        inputFingerprint,
        priorContinuityFingerprint,
      }) : null

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
          await writeJsonAtomic(checkpointPath, {
            version: 2,
            inputFingerprint,
            priorContinuityFingerprint,
            lesson: lessonDocument,
          })
        }
      }

      if (persistLesson) {
        await persistLesson(lessonDocument, assignment)
      }
      generated.push(lessonDocument)
      await progress.write({
        status: index + 1 >= assignments.length ? 'completed' : 'running',
        completedLessons: generated.length,
        currentAssignment: assignments[index + 1] ?? null,
        lastCompletedLesson: lessonDocument,
        finished: index + 1 >= assignments.length,
      })
    }
  } catch (error) {
    await progress.write({
      status: 'failed',
      completedLessons: generated.length,
      currentAssignment: assignments[generated.length] ?? assignments[regenerateFromIndex] ?? null,
      lastCompletedLesson: generated[generated.length - 1] ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
      finished: true,
    })
    throw error
  }

  return generated
}


export function createLessonGenerationProgressTracker({
  progressPath,
  totalLessons,
  assignments = [],
  metadata = {},
  writeJson = writeJsonAtomic,
  now = () => new Date(),
} = {}) {
  const started = toDate(now())
  const startedMs = started.getTime()
  const startedAt = started.toISOString()

  return {
    async write({
      status = 'running',
      completedLessons = 0,
      currentAssignment = null,
      lastCompletedLesson = null,
      errorMessage,
      finished = false,
    } = {}) {
      if (!progressPath) return null
      const updated = toDate(now())
      const elapsedMs = Math.max(0, updated.getTime() - startedMs)
      const normalizedTotalLessons = Math.max(0, Number.isInteger(totalLessons) ? totalLessons : assignments.length)
      const normalizedCompletedLessons = clampInteger(completedLessons, 0, normalizedTotalLessons)
      const snapshot = {
        version: 1,
        status,
        startedAt,
        updatedAt: updated.toISOString(),
        finishedAt: finished ? updated.toISOString() : null,
        totalLessons: normalizedTotalLessons,
        completedLessons: normalizedCompletedLessons,
        currentLessonOrder: currentAssignment?.lessonOrder ?? currentAssignment?.outlineLesson?.order ?? null,
        currentLessonTitle: currentAssignment ? getProgressAssignmentTitle(currentAssignment) : null,
        percent: computeProgressPercent(normalizedCompletedLessons, normalizedTotalLessons),
        elapsedMs,
        lastCompletedLessonOrder: lastCompletedLesson?.order ?? null,
        lastCompletedLessonTitle: lastCompletedLesson?.title ?? null,
        courseId: metadata.courseId ?? null,
        courseVersion: metadata.courseVersion ?? null,
        etaMs: computeEtaMs({ status, elapsedMs, completedLessons: normalizedCompletedLessons, totalLessons: normalizedTotalLessons }),
      }
      if (errorMessage) snapshot.errorMessage = errorMessage
      await writeJson(progressPath, snapshot)
      return snapshot
    },
  }
}

export function createProgressSnapshot({
  status = 'running',
  startedAt,
  updatedAt,
  finishedAt = null,
  totalLessons = 0,
  completedLessons = 0,
  currentLessonOrder = null,
  currentLessonTitle = null,
  elapsedMs = 0,
  lastCompletedLessonOrder = null,
  lastCompletedLessonTitle = null,
  courseId = null,
  courseVersion = null,
  etaMs,
  errorMessage,
} = {}) {
  const normalizedTotalLessons = Math.max(0, Number.isInteger(totalLessons) ? totalLessons : 0)
  const normalizedCompletedLessons = clampInteger(completedLessons, 0, normalizedTotalLessons)
  const snapshot = {
    version: 1,
    status,
    startedAt: startedAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? new Date().toISOString(),
    finishedAt,
    totalLessons: normalizedTotalLessons,
    completedLessons: normalizedCompletedLessons,
    currentLessonOrder,
    currentLessonTitle,
    percent: computeProgressPercent(normalizedCompletedLessons, normalizedTotalLessons),
    elapsedMs: Math.max(0, Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : 0),
    lastCompletedLessonOrder,
    lastCompletedLessonTitle,
    courseId,
    courseVersion,
    etaMs: etaMs === undefined ? computeEtaMs({ status, elapsedMs, completedLessons: normalizedCompletedLessons, totalLessons: normalizedTotalLessons }) : etaMs,
  }
  if (errorMessage) snapshot.errorMessage = errorMessage
  return snapshot
}

export async function writeProgressSnapshot(path, snapshot, writeJson = writeJsonAtomic) {
  if (!path) return null
  const normalized = createProgressSnapshot(snapshot)
  await writeJson(path, normalized)
  return normalized
}


export function validateCorpus({
  lessons,
  allWordTexts,
  minLessons = DEFAULT_MIN_LESSONS,
  maxLessons = DEFAULT_MAX_LESSONS,
  maxWordsPerLesson = DEFAULT_MAX_WORDS_PER_LESSON,
  requireReadyStatus = true,
  expectedWordCount,
  sourceChapters,
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
    for (const segment of targets) {
      const word = segment.word
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

  if (Array.isArray(sourceChapters) && sourceChapters.length > 0) {
    errors.push(...validateSourceIndexCoverage({ lessons: normalizedLessons.filter(Boolean), sourceChapters }))
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

async function readValidatedLessonCheckpoint({ path, outlineLesson, words, maxWordsPerLesson, inputFingerprint, priorContinuityFingerprint }) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (value?.version !== 2 || value.inputFingerprint !== inputFingerprint || value.priorContinuityFingerprint !== priorContinuityFingerprint) return null
    const validation = validateLessonDocument(value.lesson, { maxTargetWords: maxWordsPerLesson })
    if (!validation.ok) return null
    assertLessonTargetsMatchAssignment(validation.value, words, outlineLesson)
    return validation.value
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    return null
  }
}

export function createLessonInputFingerprint(assignment) {
  return fingerprintValue({
    outlineLesson: assignment?.outlineLesson,
    words: normalizeAssignedWords(assignment?.words ?? []).map((word) => ({
      id: word.id,
      text: word.text,
      meaningId: word.meaning?.id,
      definitionCn: getWordGloss(word),
    })),
  })
}

export function createPriorContinuityFingerprint(previousLesson) {
  return fingerprintValue(previousLesson ? {
    order: previousLesson.order,
    continuityNotes: previousLesson.continuityNotes,
    sourceSummary: previousLesson.sourceSummary,
    sourceChapterEnd: previousLesson.sourceChapterEnd,
  } : null)
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


function getProgressAssignmentTitle(assignment) {
  const outlineLesson = assignment?.outlineLesson ?? {}
  if (isNonEmptyString(outlineLesson.title)) return outlineLesson.title.trim()
  if (isNonEmptyString(outlineLesson.lessonTitle)) return outlineLesson.lessonTitle.trim()
  if (isNonEmptyString(outlineLesson.plotSummary)) return outlineLesson.plotSummary.trim().slice(0, 80)
  const order = assignment?.lessonOrder ?? outlineLesson.order
  return order === undefined || order === null ? null : `第${order}课`
}

function computeProgressPercent(completedLessons, totalLessons) {
  if (!totalLessons) return 0
  return Math.min(100, Math.max(0, Math.round((completedLessons / totalLessons) * 10000) / 100))
}

function computeEtaMs({ status, elapsedMs, completedLessons, totalLessons }) {
  if (status !== 'running') return null
  if (!completedLessons || completedLessons >= totalLessons) return null
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null
  return Math.max(0, Math.round((elapsedMs / completedLessons) * (totalLessons - completedLessons)))
}

function clampInteger(value, min, max) {
  const integer = Number.isInteger(value) ? value : Math.trunc(Number(value) || 0)
  return Math.min(max, Math.max(min, integer))
}

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime())
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  return new Date()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
