import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE_DIR = join(PROJECT_ROOT, 'scripts', '.story-cache', 'lessons')
const EXECUTE = process.argv.includes('--execute')
const prisma = new PrismaClient()

// Only corrections already verified as unambiguous. Context-specific vocabularyFixes
// are intentionally excluded until they receive a separate review.
const corrections = [
  { word: 'hat', old: '含义', next: '帽子', oldPos: 'noun', nextPos: 'noun' },
  { word: 'he', old: '组成部分', next: '他', oldPos: 'noun', nextPos: 'pronoun' },
  { word: 'many', old: '理论', next: '许多；众多', oldPos: 'noun', nextPos: 'determiner/pronoun' },
  { word: 'on', old: '积累，积累', next: '在……上；处于……状态', oldPos: 'verb', nextPos: 'preposition' },
  { word: 'resemble', old: '像类似', next: '像；类似', oldPos: 'verb', nextPos: 'verb' },
  { word: 'distress', old: '痛苦， distress', next: '痛苦；悲痛；遇险', oldPos: 'noun', nextPos: 'noun' },
  { word: 'lobby', old: '游说；进行 lobbying', next: '游说', oldPos: 'verb', nextPos: 'verb' },
  { word: 'racial', old: '种族的； racial', next: '种族的', oldPos: 'adj', nextPos: 'adjective' },
  { word: 'vehicle', old: '車輛', next: '车辆', oldPos: 'noun', nextPos: 'noun' },
  { word: 'ventilate', old: '通風', next: '通风', oldPos: 'verb', nextPos: 'verb' },
  { word: 'ventilation', old: '通風', next: '通风', oldPos: 'noun', nextPos: 'noun' },
  { word: 'verb', old: '動詞', next: '动词', oldPos: 'noun', nextPos: 'noun' },
  { word: 'vaunted', old: '自誇的', next: '被吹嘘的；被夸耀的', oldPos: 'adjective', nextPos: 'adjective' },
  { word: 'wound', old: '缠绕（wind过去式）', next: '缠绕；wind 的过去式', oldPos: 'verb', nextPos: 'verb' },
]

const sentenceRepairs = new Map([
  ['hat|含义', ['He wore a **hat** to protect his face from the sun.', '他戴着一顶帽子来防晒。']],
  ['he|组成部分', ['When **he** arrived, the meeting began.', '他到达时，会议开始了。']],
  ['many|理论', ['**Many** students learn new words through context.', '许多学生通过语境学习新单词。']],
  ['on|积累，积累', ['The book is **on** the table.', '这本书在桌子上。']],
  ['lobby|游说；进行 lobbying', ['The organization **lobbies** the government for policy changes.', '该组织游说政府推动政策变化。']],
])

function key(c) {
  return `${c.word}|${c.old}`
}

function walk(value, callback) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) walk(item, callback)
    return
  }
  callback(value)
  for (const child of Object.values(value)) walk(child, callback)
}

function patchLessonJson(value, meaningById, wordByOldDefinition) {
  let changed = 0
  const rowBySortOrder = value.__repairStoryRows ?? new Map()
  const paragraphs = value.paragraphs ?? []
  walk(paragraphs, (node) => {
    if (node.type !== 'targetWord') return
    const row = rowBySortOrder.get(node.wordOrder)
    const correction = row
      ? meaningById.get(row.meaningId)
      : wordByOldDefinition.get(`${node.word}|${node.definitionCn}`)
    if (correction && node.definitionCn !== correction.next) {
      node.definitionCn = correction.next
      changed++
    }
  })
  delete value.__repairStoryRows
  return changed
}
function patchCacheDocument(document, wordByOldDefinition) {
  let changed = false
  const paragraphs = document.lesson?.paragraphs ?? document.paragraphs ?? []
  walk(paragraphs, (node) => {
    if (node.type !== 'targetWord') return
    const correction = wordByOldDefinition.get(`${node.word}|${node.definitionCn}`)
    if (correction && node.definitionCn !== correction.next) {
      node.definitionCn = correction.next
      changed = true
    }
  })
  return changed
}

async function resolveCorrections(db) {
  const meaningById = new Map()
  const correctionRows = []
  for (const correction of corrections) {
    const rows = await db.meaning.findMany({
      where: {
        word: { text: correction.word, language: 'en' },
        partOfSpeech: correction.oldPos,
        definition: correction.old,
        definitionCn: correction.old,
      },
      select: { id: true, wordId: true, partOfSpeech: true, definition: true, definitionCn: true },
    })
    if (rows.length !== 1) {
      throw new Error(`${correction.word}: expected exactly 1 matching meaning, found ${rows.length}`)
    }
    const row = rows[0]
    const resolved = { ...correction, id: row.id, wordId: row.wordId }
    meaningById.set(row.id, resolved)
    correctionRows.push(resolved)
  }
  return { meaningById, correctionRows }
}

async function getReadyCourse(db) {
  const ready = await db.storyCourse.findFirst({
    where: { status: 'ready', readySlot: 'ready' },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        include: { words: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
  if (!ready) throw new Error('No ready story course found')
  const existingDraft = await db.storyCourse.findFirst({ where: { status: 'draft' }, select: { id: true, version: true } })
  if (existingDraft) throw new Error(`Existing draft course must be handled first: ${existingDraft.id}`)
  return ready
}

async function inspectCache(wordByOldDefinition) {
  let files
  try {
    files = (await readdir(CACHE_DIR)).filter((name) => /^lesson-\d{4}\.json$/.test(name)).sort()
  } catch (error) {
    if (error.code === 'ENOENT') return { directoryPresent: false, files: [], oldTargetCount: 0 }
    throw error
  }
  let oldTargetCount = 0
  for (const name of files) {
    const document = JSON.parse(await readFile(join(CACHE_DIR, name), 'utf8'))
    const paragraphs = document.lesson?.paragraphs ?? document.paragraphs ?? []
    walk(paragraphs, (node) => {
      if (node.type === 'targetWord' && wordByOldDefinition.has(`${node.word}|${node.definitionCn}`)) oldTargetCount++
    })
  }
  return { directoryPresent: true, files, oldTargetCount }
}

async function buildPlan() {
  const ready = await getReadyCourse(prisma)
  const { meaningById, correctionRows } = await resolveCorrections(prisma)
  const wordByOldDefinition = new Map(corrections.map((correction) => [key(correction), correction]))
  const sentenceRows = []
  for (const correction of correctionRows) {
    const replacement = sentenceRepairs.get(key(correction))
    if (!replacement) continue
    const sentences = await prisma.generatedSentence.findMany({
      where: { meaningId: correction.id },
      select: { id: true, sentenceText: true, sentenceCn: true },
    })
    if (sentences.length !== 1) throw new Error(`${correction.word}: expected one sentence, found ${sentences.length}`)
    sentenceRows.push({ correction, current: sentences[0], replacement })
  }

  const allLessons = await prisma.storyLesson.findMany({ include: { words: true } })
  let changedLessons = 0
  let changedStoryTargets = 0
  for (const lesson of allLessons) {
    const content = JSON.parse(lesson.contentJson)
    content.__repairStoryRows = new Map(lesson.words.map((row) => [row.sortOrder, row]))
    const changed = patchLessonJson(content, meaningById, new Map())
    if (changed > 0) {
      changedLessons++
      changedStoryTargets += changed
    }
  }

  const cache = await inspectCache(wordByOldDefinition)
  const versionMax = (await prisma.storyCourse.aggregate({ _max: { version: true } }))._max.version ?? 0
  const progressCount = await prisma.userStoryProgress.count({ where: { lessonId: { in: ready.lessons.map((lesson) => lesson.id) } } })
  const wordProgressCount = await prisma.userStoryWordProgress.count({ where: { lessonWordId: { in: ready.lessons.flatMap((lesson) => lesson.words.map((word) => word.id)) } } })
  const attemptCount = await prisma.storyReviewAttempt.count({ where: { lessonWordId: { in: ready.lessons.flatMap((lesson) => lesson.words.map((word) => word.id)) } } })

  return {
    ready,
    meaningById,
    correctionRows,
    sentenceRows,
    allLessons,
    cache,
    nextVersion: versionMax + 1,
    changedLessons,
    changedStoryTargets,
    progressCount,
    wordProgressCount,
    attemptCount,
  }
}

async function executeRepair(plan) {
  const result = await prisma.$transaction(async (tx) => {
    const ready = await getReadyCourse(tx)
    const { meaningById, correctionRows } = await resolveCorrections(tx)

    for (const correction of correctionRows) {
      await tx.meaning.update({
        where: { id: correction.id },
        data: { partOfSpeech: correction.nextPos, definition: correction.next, definitionCn: correction.next },
      })
      const replacement = sentenceRepairs.get(key(correction))
      if (replacement) {
        const sentences = await tx.generatedSentence.findMany({ where: { meaningId: correction.id }, select: { id: true } })
        if (sentences.length !== 1) throw new Error(`${correction.word}: expected one sentence, found ${sentences.length}`)
        await tx.generatedSentence.update({ where: { id: sentences[0].id }, data: { sentenceText: replacement[0], sentenceCn: replacement[1] } })
      }
      await tx.storyLessonWord.updateMany({ where: { meaningId: correction.id }, data: { glossCn: correction.next } })
    }

    const allLessons = await tx.storyLesson.findMany({ include: { words: true } })
    const changedLessons = []
    for (const lesson of allLessons) {
      const content = JSON.parse(lesson.contentJson)
      content.__repairStoryRows = new Map(lesson.words.map((row) => [row.sortOrder, row]))
      const changed = patchLessonJson(content, meaningById, new Map())
      if (changed) {
        await tx.storyLesson.update({ where: { id: lesson.id }, data: { contentJson: JSON.stringify(content) } })
        changedLessons.push(lesson.id)
      }
    }

    const version = (await tx.storyCourse.aggregate({ _max: { version: true } }))._max.version + 1
    const draft = await tx.storyCourse.create({
      data: {
        version,
        status: 'draft',
        readySlot: null,
        sourceFingerprint: ready.sourceFingerprint,
        summaryFingerprint: ready.summaryFingerprint,
        outlineFingerprint: ready.outlineFingerprint,
        assignmentFingerprint: ready.assignmentFingerprint,
        generationError: null,
        publishedAt: null,
        archivedAt: null,
      },
    })

    const newLessonByOrder = new Map()
    const newLessonWordByOldId = new Map()
    for (const oldLesson of ready.lessons) {
      const source = await tx.storyLesson.findUnique({ where: { id: oldLesson.id }, select: { contentJson: true } })
      const newLesson = await tx.storyLesson.create({
        data: {
          courseId: draft.id,
          order: oldLesson.order,
          title: oldLesson.title,
          wordGroupId: oldLesson.wordGroupId,
          sourceChapterStart: oldLesson.sourceChapterStart,
          sourceChapterEnd: oldLesson.sourceChapterEnd,
          sourceSummary: oldLesson.sourceSummary,
          continuityNotes: oldLesson.continuityNotes,
          contentJson: source.contentJson,
          status: 'ready',
          generationError: null,
          generatedAt: oldLesson.generatedAt,
        },
      })
      newLessonByOrder.set(oldLesson.order, newLesson)
      const rows = oldLesson.words.map((oldWord) => {
        const correction = meaningById.get(oldWord.meaningId)
        const newRow = {
          lessonId: newLesson.id,
          wordId: oldWord.wordId,
          meaningId: oldWord.meaningId,
          sortOrder: oldWord.sortOrder,
          glossCn: correction?.next ?? oldWord.glossCn,
        }
        newLessonWordByOldId.set(oldWord.id, newRow)
        return newRow
      })
      if (rows.length) await tx.storyLessonWord.createMany({ data: rows })
    }

    // Preserve progress created against any earlier course version, not only the
    // currently ready course. The app has one logical lesson sequence, so migrate
    // by lesson order onto the newly published version.
    const progress = await tx.userStoryProgress.findMany({
      include: { lesson: { select: { order: true, courseId: true } } },
    })
    for (const row of progress) {
      const newLesson = newLessonByOrder.get(row.lesson.order)
      if (!newLesson) throw new Error(`No cloned lesson for order ${row.lesson.order}`)
      if (row.lessonId === newLesson.id) continue
      const conflict = await tx.userStoryProgress.findFirst({
        where: { userId: row.userId, lessonId: newLesson.id, NOT: { id: row.id } },
        select: { id: true },
      })
      if (conflict) throw new Error(`Progress conflict for user ${row.userId}, lesson order ${row.lesson.order}`)
      await tx.userStoryProgress.update({ where: { id: row.id }, data: { lessonId: newLesson.id } })
    }

    const oldLessonWordIds = ready.lessons.flatMap((lesson) => lesson.words.map((word) => word.id))
    const targetLessonWord = async (oldLessonWordId) => {
      const newRow = newLessonWordByOldId.get(oldLessonWordId)
      if (!newRow) throw new Error(`No cloned row for old lesson word ${oldLessonWordId}`)
      const actual = await tx.storyLessonWord.findFirst({ where: { lessonId: newRow.lessonId, wordId: newRow.wordId }, select: { id: true } })
      if (!actual) throw new Error(`Cloned story lesson word not found for ${newRow.lessonId}/${newRow.wordId}`)
      return actual.id
    }
    const wordProgress = await tx.userStoryWordProgress.findMany({ where: { lessonWordId: { in: oldLessonWordIds } } })
    for (const row of wordProgress) {
      await tx.userStoryWordProgress.update({ where: { id: row.id }, data: { lessonWordId: await targetLessonWord(row.lessonWordId) } })
    }
    const attempts = await tx.storyReviewAttempt.findMany({ where: { lessonWordId: { in: oldLessonWordIds } } })
    for (const row of attempts) {
      await tx.storyReviewAttempt.update({ where: { id: row.id }, data: { lessonWordId: await targetLessonWord(row.lessonWordId) } })
    }

    const now = new Date()
    await tx.storyCourse.update({ where: { id: ready.id }, data: { status: 'archived', readySlot: null, archivedAt: now } })
    const published = await tx.storyCourse.update({ where: { id: draft.id }, data: { status: 'ready', readySlot: 'ready', publishedAt: now, archivedAt: null, generationError: null } })
    return {
      oldCourseId: ready.id,
      newCourseId: published.id,
      version: published.version,
      changedLessons: changedLessons.length,
      corrections: correctionRows,
    }
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 })

  const wordByOldDefinition = new Map(corrections.map((correction) => [key(correction), correction]))
  let changedCacheFiles = 0
  for (const name of plan.cache.files) {
    const filePath = join(CACHE_DIR, name)
    const document = JSON.parse(await readFile(filePath, 'utf8'))
    if (patchCacheDocument(document, wordByOldDefinition)) {
      await writeFile(filePath, JSON.stringify(document, null, 2) + '\n', 'utf8')
      changedCacheFiles++
    }
  }
  return { ...result, changedCacheFiles }
}

async function main() {
  const plan = await buildPlan()
  const summary = {
    mode: EXECUTE ? 'execute' : 'dry-run',
    readyCourse: { id: plan.ready.id, version: plan.ready.version, lessons: plan.ready.lessons.length, lessonWords: plan.ready.lessons.reduce((sum, lesson) => sum + lesson.words.length, 0) },
    nextVersion: plan.nextVersion,
    meaningCorrections: plan.correctionRows.length,
    sentenceRepairs: plan.sentenceRows.length,
    storyLessonsWithChanges: plan.changedLessons,
    storyTargetWordChanges: plan.changedStoryTargets,
    cacheFiles: plan.cache.files.length,
    cacheTargetWordChanges: plan.cache.oldTargetCount,
    progressRowsToMigrate: plan.progressCount,
    wordProgressRowsToMigrate: plan.wordProgressCount,
    reviewAttemptRowsToMigrate: plan.attemptCount,
  }

  if (!EXECUTE) {
    console.log(JSON.stringify(summary, null, 2))
    console.log('Dry-run only. Use --execute to write the database and final lesson cache.')
    return
  }

  const result = await executeRepair(plan)
  console.log(JSON.stringify({ ...summary, ...result }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())




