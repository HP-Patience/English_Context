import { validateLessonDocument } from './story-content.mjs'
import { collectTargetWordSegments } from './story-lesson-generator.mjs'

export const READY_STATUS = 'ready'
export const DRAFT_STATUS = 'draft'
export const FAILED_STATUS = 'failed'
export const DRAFT_COURSE_STATUS = 'draft'
export const READY_COURSE_STATUS = 'ready'
export const ARCHIVED_COURSE_STATUS = 'archived'
export const FAILED_COURSE_STATUS = 'failed'
export const READY_COURSE_SLOT = 'ready'
export const MAX_GENERATION_ERROR_LENGTH = 2000

export class StoryCourseValidationError extends Error {
  constructor(report) {
    super(`story course validation failed: ${(report?.errors ?? ['unknown validation failure']).join('; ')}`)
    this.name = 'StoryCourseValidationError'
    this.report = report
  }
}

export async function createOrResumeDraftCourse({ prisma, fingerprints }) {
  if (!prisma) throw new TypeError('createOrResumeDraftCourse requires prisma')
  const normalized = normalizeFingerprints(fingerprints)
  return prisma.$transaction(async (tx) => {
    const existing = await tx.storyCourse.findFirst({
      where: { status: DRAFT_COURSE_STATUS, ...normalized },
      orderBy: { version: 'desc' },
    })
    if (existing) return existing
    const aggregate = await tx.storyCourse.aggregate({ _max: { version: true } })
    const version = (aggregate?._max?.version ?? 0) + 1
    return tx.storyCourse.create({
      data: {
        version,
        status: DRAFT_COURSE_STATUS,
        readySlot: null,
        ...normalized,
        generationError: null,
        publishedAt: null,
        archivedAt: null,
      },
    })
  }, { isolationLevel: 'Serializable' })
}

export async function findLatestDraftCourse(prisma) {
  return prisma.storyCourse.findFirst({ where: { status: DRAFT_COURSE_STATUS }, orderBy: { version: 'desc' } })
}

export async function findReadyCourse(prisma) {
  return assertSingleReadyCourse(prisma)
}

/** Persist one validated lesson inside a draft course only. */
export async function persistDraftLesson({ prisma, courseId, lessonDocument, wordMap, meaningMap }) {
  if (!prisma) throw new TypeError('persistDraftLesson requires prisma')
  if (!courseId) throw new TypeError('persistDraftLesson requires courseId')

  try {
    return await prisma.$transaction(async (tx) => {
      assertDraftCourse(await tx.storyCourse.findUnique({ where: { id: courseId } }), courseId)
      const lesson = await createOrUpdateDraftLesson(tx, courseId, lessonDocument)
      const validation = validateLessonDocument(lessonDocument, { maxTargetWords: 100 })
      if (!validation.ok) throw new Error(`invalid lesson document: ${validation.errors.join('; ')}`)
      const rows = resolveLessonWordRows({ lessonId: lesson.id, lessonDocument: validation.value, wordMap, meaningMap })

      await tx.storyLesson.update({ where: { id: lesson.id }, data: { ...draftLessonData(courseId, validation.value), courseId } })
      await tx.storyLessonWord.deleteMany({ where: { lessonId: lesson.id } })
      if (rows.length > 0) await tx.storyLessonWord.createMany({ data: rows })
      await tx.storyLesson.update({
        where: { id: lesson.id },
        data: { ...readyLessonData(validation.value), generationError: null },
      })
      return { lessonId: lesson.id, createdWordCount: rows.length }
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    await markLessonFailed(prisma, courseId, lessonDocument, error)
    throw error
  }
}

export async function publishDraftCourse({ prisma, courseId, validateCourse }) {
  if (!prisma) throw new TypeError('publishDraftCourse requires prisma')
  if (!courseId) throw new TypeError('publishDraftCourse requires courseId')
  if (typeof validateCourse !== 'function') throw new TypeError('publishDraftCourse requires validateCourse')

  return prisma.$transaction(async (tx) => {
    await assertSingleReadyCourse(tx)
    const course = await tx.storyCourse.findUnique({
      where: { id: courseId },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: {
            words: { orderBy: { sortOrder: 'asc' }, include: { word: true, meaning: true } },
          },
        },
      },
    })
    assertDraftCourse(course, courseId)
    const report = await validateCourse(course)
    if (!report?.ok) throw new StoryCourseValidationError(report)

    const now = new Date()
    await tx.storyCourse.updateMany({
      where: { status: READY_COURSE_STATUS, id: { not: courseId } },
      data: { status: ARCHIVED_COURSE_STATUS, readySlot: null, archivedAt: now },
    })
    const publishedCourse = await tx.storyCourse.update({
      where: { id: courseId },
      data: {
        status: READY_COURSE_STATUS,
        readySlot: READY_COURSE_SLOT,
        generationError: null,
        publishedAt: now,
        archivedAt: null,
      },
    })
    return { course: publishedCourse, report }
  }, { isolationLevel: 'Serializable' })
}

export function resolveLessonWordRows({ lessonId, lessonDocument, wordMap, meaningMap }) {
  const targetSegments = collectTargetWordSegments(lessonDocument)
  const seenWords = new Set()
  const rows = []
  for (const [index, segment] of targetSegments.entries()) {
    const expectedSortOrder = index + 1
    const wordText = segment.word.trim()
    if (seenWords.has(wordText)) throw new Error(`duplicate target word segment: ${wordText}`)
    seenWords.add(wordText)
    if (segment.wordOrder !== expectedSortOrder) throw new Error(`target word ${wordText} has wordOrder ${segment.wordOrder}; expected contiguous wordOrder ${expectedSortOrder}`)
    const word = lookup(wordMap, wordText)
    if (!word?.id) throw new Error(`target word not found in Word table: ${wordText}`)
    const meaning = lookup(meaningMap, wordText) ?? lookup(meaningMap, word.id)
    if (!meaning?.id) throw new Error(`selected meaning not found for word: ${wordText}`)
    if (meaning.wordId !== word.id) throw new Error(`meaning ${meaning.id} does not belong to word ${wordText} (${word.id})`)
    const assignedGloss = meaning.definitionCn ?? meaning.definition
    if (typeof assignedGloss === 'string' && segment.definitionCn !== assignedGloss) throw new Error(`target word ${wordText} gloss ${segment.definitionCn} does not match selected meaning gloss ${assignedGloss}`)
    rows.push({ lessonId, wordId: word.id, meaningId: meaning.id, sortOrder: segment.wordOrder, glossCn: segment.definitionCn })
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
      if (meaning?.id) { meaningMap.set(text, meaning); meaningMap.set(word.id, meaning) }
    }
  }
  return { wordMap, meaningMap }
}

async function createOrUpdateDraftLesson(prisma, courseId, lessonDocument) {
  const data = draftLessonData(courseId, lessonDocument)
  return prisma.storyLesson.upsert({
    where: { courseId_order: { courseId, order: data.order } },
    create: data,
    update: data,
  })
}

function draftLessonData(courseId, lessonDocument) {
  return {
    courseId,
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

async function markLessonFailed(prisma, courseId, lessonDocument, error) {
  await prisma.$transaction(async (tx) => {
    const course = await tx.storyCourse.findUnique({ where: { id: courseId } })
    if (course?.status !== DRAFT_COURSE_STATUS || course.readySlot) return
    const lesson = await createOrUpdateDraftLesson(tx, courseId, lessonDocument)
    await tx.storyLessonWord.deleteMany({ where: { lessonId: lesson.id } })
    await tx.storyLesson.update({ where: { id: lesson.id }, data: { status: FAILED_STATUS, generationError: boundError(error), generatedAt: null } })
  }, { isolationLevel: 'Serializable' })
}

async function assertSingleReadyCourse(prisma) {
  const course = await prisma.storyCourse.findUnique({ where: { readySlot: READY_COURSE_SLOT } })
  if (!course) return null
  if (course.readySlot !== READY_COURSE_SLOT) throw new Error(`publication invariant violated: ready course lookup returned course ${course.id} without the ready slot`)
  if (course.status !== READY_COURSE_STATUS) throw new Error(`publication invariant violated: course ${course.id} occupies the ready slot with status ${course.status}`)
  return course
}

function normalizeFingerprints(fingerprints) {
  const result = {}
  for (const field of ['sourceFingerprint', 'summaryFingerprint', 'outlineFingerprint', 'assignmentFingerprint']) {
    const value = fingerprints?.[field]
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`)
    result[field] = value.trim()
  }
  return result
}

function assertDraftCourse(course, courseId) {
  if (!course) throw new Error(`story course not found: ${courseId}`)
  if (course.status !== DRAFT_COURSE_STATUS || course.readySlot) throw new Error(`story course ${courseId} is published/immutable; generation may mutate draft courses only`)
}

function chooseSelectedMeaning(word) {
  if (word?.meaning?.id) return word.meaning
  if (word?.selectedMeaning?.id) return word.selectedMeaning
  if (Array.isArray(word?.meanings) && word.meanings.length > 0) return word.meanings.find((meaning) => typeof meaning.definitionCn === 'string' && meaning.definitionCn.trim()) ?? word.meanings[0]
  return undefined
}
function lookup(mapLike, key) { if (!mapLike || key === undefined || key === null) return undefined; return mapLike instanceof Map ? mapLike.get(key) : mapLike[key] }
function safeString(value, fallback) { return typeof value === 'string' ? value : fallback }
function boundError(error) { const message = error instanceof Error ? error.message : String(error); return message.length > MAX_GENERATION_ERROR_LENGTH ? message.slice(0, MAX_GENERATION_ERROR_LENGTH) : message }
