import { validateLessonDocument } from './story-content.mjs'
import { collectTargetWordSegments } from './story-lesson-generator.mjs'

export const READY_STATUS = 'ready'
export const DRAFT_STATUS = 'draft'
export const FAILED_STATUS = 'failed'
export const MAX_GENERATION_ERROR_LENGTH = 2000

/**
 * Idempotently persist one already generated/validated lesson and its target words.
 *
 * @param {{ prisma: object, lessonDocument: object, wordMap: Map<string, object>|object, meaningMap: Map<string, object>|object }} options
 * @returns {Promise<{ lessonId: string, createdWordCount: number }>}
 */
export async function persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap }) {
  if (!prisma) throw new TypeError('persistReadyLesson requires prisma')

  const lesson = await createOrUpdateDraftLesson(prisma, lessonDocument)

  try {
    const validation = validateLessonDocument(lessonDocument, { maxTargetWords: 100 })
    if (!validation.ok) {
      throw new Error(`invalid lesson document: ${validation.errors.join('; ')}`)
    }

    const rows = resolveLessonWordRows({ lessonId: lesson.id, lessonDocument: validation.value, wordMap, meaningMap })

    await prisma.$transaction(async (tx) => {
      await tx.storyLesson.update({
        where: { id: lesson.id },
        data: draftLessonData(validation.value),
      })
      await tx.storyLessonWord.deleteMany({ where: { lessonId: lesson.id } })
      if (rows.length > 0) {
        await tx.storyLessonWord.createMany({ data: rows })
      }
      await tx.storyLesson.update({
        where: { id: lesson.id },
        data: {
          ...readyLessonData(validation.value),
          generationError: null,
        },
      })
    })

    return { lessonId: lesson.id, createdWordCount: rows.length }
  } catch (error) {
    await markLessonFailed(prisma, lesson.id, error)
    throw error
  }
}

export function resolveLessonWordRows({ lessonId, lessonDocument, wordMap, meaningMap }) {
  const targetSegments = collectTargetWordSegments(lessonDocument)
  const seenWords = new Set()
  const rows = []

  for (const [index, segment] of targetSegments.entries()) {
    const expectedSortOrder = index + 1
    const wordText = segment.word.trim()
    if (seenWords.has(wordText)) {
      throw new Error(`duplicate target word segment: ${wordText}`)
    }
    seenWords.add(wordText)

    if (segment.wordOrder !== expectedSortOrder) {
      throw new Error(`target word ${wordText} has wordOrder ${segment.wordOrder}; expected contiguous wordOrder ${expectedSortOrder}`)
    }

    const word = lookup(wordMap, wordText)
    if (!word?.id) {
      throw new Error(`target word not found in Word table: ${wordText}`)
    }

    const meaning = lookup(meaningMap, wordText) ?? lookup(meaningMap, word.id)
    if (!meaning?.id) {
      throw new Error(`selected meaning not found for word: ${wordText}`)
    }

    if (meaning.wordId !== word.id) {
      throw new Error(`meaning ${meaning.id} does not belong to word ${wordText} (${word.id})`)
    }

    const assignedGloss = meaning.definitionCn ?? meaning.definition
    if (typeof assignedGloss === 'string' && segment.definitionCn !== assignedGloss) {
      throw new Error(`target word ${wordText} gloss ${segment.definitionCn} does not match selected meaning gloss ${assignedGloss}`)
    }

    rows.push({
      lessonId,
      wordId: word.id,
      meaningId: meaning.id,
      sortOrder: segment.wordOrder,
      glossCn: segment.definitionCn,
    })
  }

  return rows
}


export function buildWordAndMeaningMaps(wordGroups) {
  const wordMap = new Map()
  const meaningMap = new Map()

  for (const group of wordGroups ?? []) {
    const items = Array.isArray(group?.words) ? group.words : Array.isArray(group?.items) ? group.items : []
    for (const item of items) {
      const word = item?.word ?? item
      if (!word?.id || typeof word?.text !== 'string' || !word.text.trim()) continue
      const text = word.text.trim()
      const meaning = chooseSelectedMeaning(word)
      wordMap.set(text, { ...word, text, meaning })
      if (meaning?.id) {
        meaningMap.set(text, meaning)
        meaningMap.set(word.id, meaning)
      }
    }
  }

  return { wordMap, meaningMap }
}

async function createOrUpdateDraftLesson(prisma, lessonDocument) {
  const data = draftLessonData(lessonDocument)
  return prisma.storyLesson.upsert({
    where: { order: data.order },
    create: data,
    update: data,
  })
}

function draftLessonData(lessonDocument) {
  return {
    title: safeString(lessonDocument?.title, `Story ${lessonDocument?.order ?? ''}`.trim()),
    order: Number.isInteger(lessonDocument?.order) ? lessonDocument.order : 0,
    wordGroupId: lessonDocument?.wordGroupId ?? null,
    sourceChapterStart: safeString(lessonDocument?.sourceChapterStart, ''),
    sourceChapterEnd: safeString(lessonDocument?.sourceChapterEnd, ''),
    sourceSummary: safeString(lessonDocument?.sourceSummary, ''),
    continuityNotes: safeString(lessonDocument?.continuityNotes, ''),
    contentJson: JSON.stringify(lessonDocument ?? {}),
    status: DRAFT_STATUS,
    generationError: null,
    generatedAt: null,
  }
}

function readyLessonData(lessonDocument) {
  return {
    title: lessonDocument.title,
    order: lessonDocument.order,
    wordGroupId: lessonDocument.wordGroupId ?? null,
    sourceChapterStart: String(lessonDocument.sourceChapterStart),
    sourceChapterEnd: String(lessonDocument.sourceChapterEnd),
    sourceSummary: lessonDocument.sourceSummary,
    continuityNotes: lessonDocument.continuityNotes,
    contentJson: JSON.stringify(lessonDocument),
    status: READY_STATUS,
    generatedAt: new Date(),
  }
}

async function markLessonFailed(prisma, lessonId, error) {
  const message = boundError(error)
  await prisma.$transaction(async (tx) => {
    await tx.storyLessonWord.deleteMany({ where: { lessonId } })
    await tx.storyLesson.update({
      where: { id: lessonId },
      data: {
        status: FAILED_STATUS,
        generationError: message,
        generatedAt: null,
      },
    })
  })
}

function chooseSelectedMeaning(word) {
  if (word?.meaning?.id) return word.meaning
  if (word?.selectedMeaning?.id) return word.selectedMeaning
  if (Array.isArray(word?.meanings) && word.meanings.length > 0) {
    return word.meanings.find((meaning) => typeof meaning.definitionCn === 'string' && meaning.definitionCn.trim()) ?? word.meanings[0]
  }
  return undefined
}

function lookup(mapLike, key) {
  if (!mapLike || key === undefined || key === null) return undefined
  if (mapLike instanceof Map) return mapLike.get(key)
  return mapLike[key]
}

function safeString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function boundError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > MAX_GENERATION_ERROR_LENGTH ? message.slice(0, MAX_GENERATION_ERROR_LENGTH) : message
}
