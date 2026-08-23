#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLlmJsonClient } from './lib/llm-json.mjs'
import { fingerprintValue } from './lib/input-fingerprint.mjs'
import { assignWordsToOutline, createLessonPrompt, generateLesson, generateLessonsFromAssignments, writeProgressSnapshot } from './lib/story-lesson-generator.mjs'
import { buildWordAndMeaningMaps, createOrResumeDraftCourse, persistDraftLesson } from './lib/story-lesson-repository.mjs'
import { validateStoryOutline, writeJsonAtomic } from './lib/story-outline.mjs'
import { loadEnvFiles } from './build-story-outline.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_LESSON_CHECKPOINT_DIR = resolve(PROJECT_ROOT, 'scripts/.story-cache/lessons')
export const DEFAULT_PRE_LESSON_SUBDIR = 'pre_lessons'
export const DEFAULT_REPORT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-generation-report.json')
export const DEFAULT_PROGRESS_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-generation-progress.json')
export const DEFAULT_MODEL = 'gpt-4.1-mini'
export const DEFAULT_EXPECTED_WORD_COUNT = 6098

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args)
  const log = dependencies.log ?? console.log
  if (options.help) { log(helpText()); return { help: true } }
  const env = dependencies.env ?? process.env
  if (dependencies.loadEnvironment !== false) loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')], env)

  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const outlinePath = options.outlinePath ?? DEFAULT_OUTLINE_PATH
  const checkpointDir = options.checkpointDir ?? DEFAULT_LESSON_CHECKPOINT_DIR
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH
  const progressPath = options.progressPath ?? DEFAULT_PROGRESS_PATH
  const maxWordsPerLesson = options.maxWordsPerLesson ?? 100
  const concurrency = options.concurrency ?? 1
  const expectedWordCount = options.expectedWordCount ?? DEFAULT_EXPECTED_WORD_COUNT
  const preLessonsOnly = options.preLessonsOnly === true
  const fromPreLessons = options.fromPreLessons === true
  const writePreLessons = preLessonsOnly || options.writePreLessons === true
  const sampleMode = options.sample === true || preLessonsOnly || fromPreLessons
  const fileExists = dependencies.existsSync ?? existsSync
  const readJson = dependencies.readJson ?? (async (path) => JSON.parse(await readFile(path, 'utf8')))
  const writeProgressJson = dependencies.writeProgressJson ?? writeJsonAtomic
  const initialProgressAt = toProgressIso(dependencies.now?.() ?? new Date())
  await writeProgressSnapshot(progressPath, {
    status: 'starting',
    startedAt: initialProgressAt,
    updatedAt: initialProgressAt,
    totalLessons: 0,
    completedLessons: 0,
    elapsedMs: 0,
  }, writeProgressJson)

  if (concurrency !== 1) throw new Error('story:generate currently supports --concurrency 1 only to preserve lesson continuity')
  if (!fileExists(indexPath)) throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  if (!fileExists(outlinePath)) throw new Error(`story outline not found: ${displayPath(outlinePath)}`)
  const index = await readJson(indexPath)
  const outline = await readJson(outlinePath)
  assertFingerprintBoundInputs(index, outline)
  validateStoryOutline(outline, [], { sourceChapters: index.chapters })
  const lessonRange = createLessonRange({ fromOrder: options.fromOrder, toOrder: options.toOrder, totalLessons: outline.lessons.length })
  if ((options.fromOrder !== undefined || options.toOrder !== undefined) && !sampleMode) {
    throw new Error('--from/--to currently require --sample, --pre-lessons-only, or --from-pre-lessons so partial runs cannot mutate the draft course accidentally')
  }

  if (fromPreLessons) {
    const preLessonsDir = resolve(options.preLessonsDir ?? resolve(checkpointDir, DEFAULT_PRE_LESSON_SUBDIR))
    const lessonOutputDir = resolve(options.lessonOutputDir ?? checkpointDir)
    const generateJson = dependencies.generateJson ?? createLlmJsonClient({
      apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY'], env),
      baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL'], env),
      model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL'], env) ?? DEFAULT_MODEL,
      transport: getFirstEnv(['STORY_LLM_TRANSPORT'], env) ?? 'responses',
    }).generateJson
    const generated = await generateLessonFilesFromPreLessons({
      preLessonsDir,
      lessonOutputDir,
      lessonRange,
      generateJson,
      maxWordsPerLesson,
      progressPath,
      writeProgressJson,
      now: dependencies.now,
      writeJson: dependencies.writeJsonAtomic ?? writeJsonAtomic,
    })
    const report = {
      version: 2,
      generatedAt: new Date().toISOString(),
      courseId: null,
      courseVersion: `from-pre-lessons-${lessonRange.from}-${lessonRange.to}`,
      courseStatus: 'from_pre_lessons',
      indexPath: displayPath(indexPath),
      outlinePath: displayPath(outlinePath),
      preLessonsDir: displayPath(preLessonsDir),
      lessonOutputDir: displayPath(lessonOutputDir),
      chapterCount: index.chapters.length,
      lessonCount: outline.lessons.length,
      selectedLessonCount: generated.length,
      lessonRange,
      sampleMode: true,
      generatedLessonCount: generated.length,
      maxWordsPerLesson,
      outputFiles: generated.map((item) => item.fileName),
    }
    await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
    log(`Generated lesson JSON files from pre_lessons: ${generated.length}`)
    log(`Pre-lesson directory: ${displayPath(preLessonsDir)}`)
    log(`Lesson JSON output directory: ${displayPath(lessonOutputDir)}`)
    log(`Generation report written: ${displayPath(reportPath)}`)
    return report
  }

  const prisma = dependencies.prisma ?? await createPrismaClient()
  const ownsPrisma = !dependencies.prisma
  try {
    const loadGroups = dependencies.loadOrderedWordGroups ?? loadOrderedWordGroups
    const wordGroups = await loadGroups(prisma)
    const { wordMap, meaningMap } = buildWordAndMeaningMaps(wordGroups)
    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson })
    const selectedAssignments = selectAssignmentsByRange(assignmentResult.assignments, lessonRange)
    if (assignmentResult.report.totalWords !== expectedWordCount) throw new Error(`expected exactly ${expectedWordCount} vocabulary words but loaded ${assignmentResult.report.totalWords}`)
    if (assignmentResult.unassignedWords.length > 0) throw new Error(`outline capacity left ${assignmentResult.unassignedWords.length} words unassigned`)

    const preLessonsDir = resolve(options.preLessonsDir ?? resolve(checkpointDir, DEFAULT_PRE_LESSON_SUBDIR))
    const fingerprints = computeCourseFingerprints({ index, outline, assignments: assignmentResult.assignments })
    const sampleVersion = `sample-${lessonRange.from}-${lessonRange.to}`
    let course = { id: 'sample', version: sampleVersion, status: 'sample' }
    let existingLessonsByOrder = new Map()
    let firstNonReady = selectedAssignments[0] ?? null

    if (!sampleMode) {
      const createDraft = dependencies.createOrResumeDraftCourse ?? createOrResumeDraftCourse
      course = await createDraft({ prisma, fingerprints })
      if (course.status !== 'draft') throw new Error(`generation requires a draft course; received ${course.status}`)

      const existingLessons = await prisma.storyLesson.findMany({ where: { courseId: course.id }, orderBy: { order: 'asc' } })
      existingLessonsByOrder = new Map(existingLessons.map((lesson) => [lesson.order, lesson]))
      firstNonReady = selectedAssignments.find((assignment) => existingLessonsByOrder.get(assignment.lessonOrder)?.status !== 'ready') ?? null
    }

    let preLessonManifest = null
    if (writePreLessons) {
      preLessonManifest = await writePreLessonInputs({
        assignments: selectedAssignments,
        allAssignments: assignmentResult.assignments,
        index,
        outline,
        indexPath,
        outlinePath,
        preLessonsDir,
        writeJson: dependencies.writeJsonAtomic ?? writeJsonAtomic,
      })
    }

    if (preLessonsOnly) {
      const completedAt = toProgressIso(dependencies.now?.() ?? new Date())
      await writeProgressSnapshot(progressPath, {
        status: 'completed',
        startedAt: initialProgressAt,
        updatedAt: completedAt,
        finishedAt: completedAt,
        totalLessons: selectedAssignments.length,
        completedLessons: selectedAssignments.length,
        currentLessonOrder: null,
        currentLessonTitle: null,
        percent: 100,
        elapsedMs: 0,
      }, writeProgressJson)
      const report = createGenerationReport({
        course,
        sampleMode: true,
        courseStatus: 'pre_lessons',
        index,
        indexPath,
        outlinePath,
        assignmentResult,
        selectedAssignments,
        lessonRange,
        firstNonReady,
        generatedLessonCount: 0,
        maxWordsPerLesson,
        fingerprints,
        preLessonManifest,
        preLessonsDir,
      })
      await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
      log(`Pre-lesson JSON files written: ${preLessonManifest.lessonCount}`)
      log(`Pre-lesson directory: ${displayPath(preLessonsDir)}`)
      log(`Generation report written: ${displayPath(reportPath)}`)
      return report
    }

    const checkpointSubdir = sampleMode ? sampleVersion : `course-${course.version}`
    const resolvedCheckpointDir = resolve(checkpointDir, checkpointSubdir)
    const generateJson = dependencies.generateJson ?? createLlmJsonClient({
      apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY'], env),
      baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL'], env),
      model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL'], env) ?? DEFAULT_MODEL,
      transport: getFirstEnv(['STORY_LLM_TRANSPORT'], env) ?? 'responses',
    }).generateJson
    const persist = dependencies.persistDraftLesson ?? persistDraftLesson
    const generatedLessons = await generateLessonsFromAssignments({
      assignments: selectedAssignments,
      generateJson,
      checkpointDir: resolvedCheckpointDir,
      existingLessonsByOrder,
      maxWordsPerLesson,
      progressPath,
      progressMetadata: {
        courseId: sampleMode ? null : course.id,
        courseVersion: course.version,
        sampleMode,
        lessonRange,
        outlinePath: displayPath(outlinePath),
        checkpointDir: displayPath(resolvedCheckpointDir),
        preLessonsDir: preLessonManifest ? displayPath(preLessonsDir) : null,
        wordCount: assignmentResult.report.totalWords,
      },
      writeProgressJson,
      now: dependencies.now,
      persistLesson: sampleMode ? undefined : (lessonDocument) => persist({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    })

    const report = createGenerationReport({
      course,
      sampleMode,
      courseStatus: sampleMode ? 'sample' : 'draft',
      index,
      indexPath,
      outlinePath,
      assignmentResult,
      selectedAssignments,
      lessonRange,
      firstNonReady,
      generatedLessonCount: generatedLessons.length,
      maxWordsPerLesson,
      fingerprints,
      preLessonManifest,
      preLessonsDir,
    })
    await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
    log(`${sampleMode ? 'Sample story lessons' : `Draft story course v${course.version} lessons`} processed: ${generatedLessons.length}`)
    log(`Vocabulary assigned: ${assignmentResult.report.assignedWordCount}`)
    if (preLessonManifest) log(`Pre-lesson JSON files written under: ${displayPath(preLessonsDir)}`)
    log(`Lesson checkpoints written under: ${displayPath(resolvedCheckpointDir)}`)
    log(`Generation report written: ${displayPath(reportPath)}`)
    log(`Generation progress snapshot: ${displayPath(progressPath)}`)
    return report
  } finally {
    if (ownsPrisma) await prisma.$disconnect()
  }
}


export async function writePreLessonInputs({
  assignments,
  allAssignments = assignments,
  index,
  outline,
  indexPath,
  outlinePath,
  preLessonsDir,
  writeJson = writeJsonAtomic,
}) {
  if (!Array.isArray(assignments)) throw new TypeError('writePreLessonInputs requires assignments')
  if (!Array.isArray(allAssignments)) throw new TypeError('writePreLessonInputs requires allAssignments')
  if (!index || !Array.isArray(index.chapters)) throw new TypeError('writePreLessonInputs requires index.chapters')
  if (!outline || !Array.isArray(outline.lessons)) throw new TypeError('writePreLessonInputs requires outline.lessons')
  if (!preLessonsDir) throw new TypeError('writePreLessonInputs requires preLessonsDir')

  await mkdir(preLessonsDir, { recursive: true })
  const allByOrder = new Map(allAssignments.map((assignment) => [assignment.lessonOrder, assignment]))
  const files = []
  let totalTargetWords = 0

  for (const assignment of assignments) {
    const previousAssignment = allByOrder.get(assignment.lessonOrder - 1) ?? null
    const nextAssignment = allByOrder.get(assignment.lessonOrder + 1) ?? null
    const targetWords = assignment.words.map((word, index) => serializePreLessonWord(word, index + 1))
    totalTargetWords += targetWords.length
    const prompt = createLessonPrompt({
      outlineLesson: assignment.outlineLesson,
      words: assignment.words,
      previousLesson: previousAssignment ? outlineLessonToContinuityPreview(previousAssignment.outlineLesson) : null,
      nextLesson: nextAssignment ? outlineLessonToContinuityPreview(nextAssignment.outlineLesson) : null,
    })
    const fileName = `lesson-${String(assignment.lessonOrder).padStart(4, '0')}.json`
    const filePath = resolve(preLessonsDir, fileName)
    const document = {
      version: 1,
      kind: 'story-lesson-ai-input-preview',
      lessonOrder: assignment.lessonOrder,
      generatedAt: new Date().toISOString(),
      sourceFiles: {
        novelIndex: displayPath(resolve(indexPath)),
        storyOutline: displayPath(resolve(outlinePath)),
      },
      sourceFingerprints: {
        sourceFingerprint: index.sourceFingerprint ?? null,
        chapterIndexFingerprint: index.chapterIndexFingerprint ?? null,
        summaryFingerprint: outline.summaryFingerprint ?? null,
        outlineInputFingerprint: outline.inputFingerprint ?? null,
      },
      sourceChapterRange: {
        start: assignment.outlineLesson.sourceChapterStart,
        end: assignment.outlineLesson.sourceChapterEnd,
        chapters: selectSourceChapters(index.chapters, assignment.outlineLesson.sourceChapterStart, assignment.outlineLesson.sourceChapterEnd),
      },
      outlineLesson: assignment.outlineLesson,
      previousLessonPreview: previousAssignment ? summarizeOutlineForPreLesson(previousAssignment.outlineLesson) : null,
      nextLessonPreview: nextAssignment ? summarizeOutlineForPreLesson(nextAssignment.outlineLesson) : null,
      targetWordCount: targetWords.length,
      targetWords,
      llmPromptPreview: prompt,
    }
    await writeJson(filePath, document)
    files.push({ lessonOrder: assignment.lessonOrder, fileName, targetWordCount: targetWords.length })
  }

  const manifest = {
    version: 1,
    kind: 'story-lesson-ai-input-preview-manifest',
    generatedAt: new Date().toISOString(),
    lessonCount: files.length,
    totalTargetWords,
    directory: displayPath(preLessonsDir),
    files,
  }
  await writeJson(resolve(preLessonsDir, 'manifest.json'), manifest)
  return manifest
}

function createGenerationReport({
  course,
  sampleMode,
  courseStatus,
  index,
  indexPath,
  outlinePath,
  assignmentResult,
  selectedAssignments,
  lessonRange,
  firstNonReady,
  generatedLessonCount,
  maxWordsPerLesson,
  fingerprints,
  preLessonManifest,
  preLessonsDir,
}) {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    courseId: sampleMode ? null : course.id,
    courseVersion: course.version,
    courseStatus,
    indexPath: displayPath(indexPath),
    outlinePath: displayPath(outlinePath),
    chapterCount: index.chapters.length,
    lessonCount: assignmentResult.assignments.length,
    selectedLessonCount: selectedAssignments.length,
    lessonRange,
    sampleMode,
    preLessonsOnly: courseStatus === 'pre_lessons',
    preLessonsDir: preLessonManifest ? displayPath(preLessonsDir) : null,
    preLessonCount: preLessonManifest?.lessonCount ?? 0,
    wordCount: assignmentResult.report.totalWords,
    assignedWordCount: assignmentResult.report.assignedWordCount,
    unassignedWordCount: assignmentResult.report.unassignedWordCount,
    duplicateWordTexts: assignmentResult.report.duplicateWordTexts,
    firstNonReadyLessonOrder: firstNonReady?.lessonOrder ?? null,
    generatedLessonCount,
    maxWordsPerLesson,
    fingerprints,
  }
}

function outlineLessonToContinuityPreview(outlineLesson) {
  return {
    continuityNotes: outlineLesson?.continuityEnd,
    continuityEnd: outlineLesson?.continuityEnd,
    continuityStart: outlineLesson?.continuityStart,
    sourceSummary: outlineLesson?.plotSummary,
  }
}

function summarizeOutlineForPreLesson(outlineLesson) {
  return outlineLesson ? {
    order: outlineLesson.order,
    sourceChapterStart: outlineLesson.sourceChapterStart,
    sourceChapterEnd: outlineLesson.sourceChapterEnd,
    plotSummary: outlineLesson.plotSummary,
    continuityStart: outlineLesson.continuityStart,
    continuityEnd: outlineLesson.continuityEnd,
  } : null
}

function serializePreLessonWord(word, order) {
  const meaning = word?.meaning ?? word?.selectedMeaning ?? (Array.isArray(word?.meanings) ? word.meanings[0] : null)
  return {
    order,
    id: word?.id ?? null,
    text: word?.text,
    phonetic: word?.phonetic ?? null,
    meaningId: meaning?.id ?? null,
    definitionCn: word?.definitionCn ?? meaning?.definitionCn ?? meaning?.definition ?? null,
    groupSortOrder: word?.groupSortOrder ?? null,
    itemSortOrder: word?.itemSortOrder ?? null,
  }
}

function selectSourceChapters(chapters, rawStart, rawEnd) {
  const start = Number(rawStart)
  const end = Number(rawEnd)
  if (!Number.isInteger(start) || !Number.isInteger(end)) return []
  return chapters
    .filter((chapter) => Number(chapter?.order) >= start && Number(chapter?.order) <= end)
    .map((chapter) => ({
      order: chapter.order,
      sourceOrder: chapter.sourceOrder ?? null,
      title: chapter.title ?? null,
      startOffset: chapter.startOffset ?? null,
      endOffset: chapter.endOffset ?? null,
      characterCount: chapter.characterCount ?? null,
    }))
}


export async function generateLessonFilesFromPreLessons({
  preLessonsDir,
  lessonOutputDir,
  lessonRange,
  generateJson,
  maxWordsPerLesson = 100,
  progressPath,
  writeProgressJson = writeJsonAtomic,
  now = () => new Date(),
  writeJson = writeJsonAtomic,
}) {
  if (!preLessonsDir) throw new TypeError('generateLessonFilesFromPreLessons requires preLessonsDir')
  if (!lessonOutputDir) throw new TypeError('generateLessonFilesFromPreLessons requires lessonOutputDir')
  if (typeof generateJson !== 'function') throw new TypeError('generateLessonFilesFromPreLessons requires generateJson')

  await mkdir(lessonOutputDir, { recursive: true })
  const startedAt = toProgressIso(now?.() ?? new Date())
  const orders = []
  for (let order = lessonRange.from; order <= lessonRange.to; order += 1) orders.push(order)
  const generated = []

  await writeProgressSnapshot(progressPath, {
    status: orders.length > 0 ? 'running' : 'completed',
    startedAt,
    updatedAt: startedAt,
    totalLessons: orders.length,
    completedLessons: 0,
    currentLessonOrder: orders[0] ?? null,
    currentLessonTitle: orders[0] ? `第${orders[0]}课` : null,
    percent: orders.length > 0 ? 0 : 100,
    elapsedMs: 0,
  }, writeProgressJson)

  try {
    for (const [index, order] of orders.entries()) {
      const preLessonFileName = `lesson-${String(order).padStart(4, '0')}.json`
      const preLessonPath = resolve(preLessonsDir, preLessonFileName)
      const preLesson = JSON.parse(await readFile(preLessonPath, 'utf8'))
      const outlineLesson = preLesson.outlineLesson
      const words = preLesson.targetWords.map(preLessonWordToAssignedWord)
      const lesson = await generateLesson({
        outlineLesson,
        words,
        previousLesson: preLesson.previousLessonPreview,
        nextLesson: preLesson.nextLessonPreview,
        generateJson,
        maxWordsPerLesson,
        promptOverride: preLesson.llmPromptPreview,
      })
      const outputFileName = preLessonFileName
      const outputPath = resolve(lessonOutputDir, outputFileName)
      await writeJson(outputPath, {
        version: 1,
        kind: 'generated-story-lesson',
        generatedAt: new Date().toISOString(),
        preLessonInputFile: displayPath(preLessonPath),
        lesson,
      })
      generated.push({ lessonOrder: order, fileName: outputFileName, path: outputPath, targetWordCount: words.length })

      const updatedAt = toProgressIso(now?.() ?? new Date())
      const completedLessons = index + 1
      await writeProgressSnapshot(progressPath, {
        status: completedLessons >= orders.length ? 'completed' : 'running',
        startedAt,
        updatedAt,
        finishedAt: completedLessons >= orders.length ? updatedAt : null,
        totalLessons: orders.length,
        completedLessons,
        currentLessonOrder: orders[index + 1] ?? null,
        currentLessonTitle: orders[index + 1] ? `第${orders[index + 1]}课` : null,
        lastCompletedLessonOrder: order,
        lastCompletedLessonTitle: lesson.title,
        percent: orders.length ? Math.round((completedLessons / orders.length) * 10000) / 100 : 100,
        elapsedMs: 0,
      }, writeProgressJson)
    }
    return generated
  } catch (error) {
    const updatedAt = toProgressIso(now?.() ?? new Date())
    await writeProgressSnapshot(progressPath, {
      status: 'failed',
      startedAt,
      updatedAt,
      finishedAt: updatedAt,
      totalLessons: orders.length,
      completedLessons: generated.length,
      currentLessonOrder: orders[generated.length] ?? null,
      currentLessonTitle: orders[generated.length] ? `第${orders[generated.length]}课` : null,
      percent: orders.length ? Math.round((generated.length / orders.length) * 10000) / 100 : 0,
      elapsedMs: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    }, writeProgressJson)
    throw error
  }
}

function preLessonWordToAssignedWord(word) {
  return {
    id: word.id ?? undefined,
    text: word.text,
    phonetic: word.phonetic ?? undefined,
    definitionCn: word.definitionCn,
    groupSortOrder: word.groupSortOrder ?? undefined,
    itemSortOrder: word.itemSortOrder ?? word.order,
    meaning: {
      id: word.meaningId ?? undefined,
      wordId: word.id ?? undefined,
      definitionCn: word.definitionCn,
    },
  }
}


export function createLessonRange({ fromOrder, toOrder, totalLessons }) {
  const from = fromOrder ?? 1
  const to = toOrder ?? totalLessons
  if (!Number.isInteger(totalLessons) || totalLessons < 1) throw new Error('totalLessons must be a positive integer')
  if (!Number.isInteger(from) || from < 1) throw new Error('--from must be a positive integer')
  if (!Number.isInteger(to) || to < 1) throw new Error('--to must be a positive integer')
  if (from > to) throw new Error('--from must be less than or equal to --to')
  if (to > totalLessons) throw new Error(`--to ${to} exceeds outline lesson count ${totalLessons}`)
  return { from, to }
}

export function selectAssignmentsByRange(assignments, range) {
  const selected = assignments.filter((assignment) => assignment.lessonOrder >= range.from && assignment.lessonOrder <= range.to)
  if (selected.length !== range.to - range.from + 1) {
    throw new Error(`lesson range ${range.from}-${range.to} did not match contiguous assignments`)
  }
  return selected
}

export function computeCourseFingerprints({ index, outline, assignments }) {
  return {
    sourceFingerprint: index.sourceFingerprint,
    summaryFingerprint: outline.summaryFingerprint,
    outlineFingerprint: fingerprintValue(outline.lessons),
    assignmentFingerprint: fingerprintValue(assignments.map((assignment) => ({
      lessonOrder: assignment.lessonOrder,
      outlineLesson: assignment.outlineLesson,
      words: assignment.words.map((word) => ({ id: word.id, text: word.text, meaningId: word.meaning?.id, definitionCn: word.definitionCn ?? word.meaning?.definitionCn ?? word.meaning?.definition })),
    }))),
  }
}

export function assertFingerprintBoundInputs(index, outline) {
  if (!Array.isArray(index?.chapters) || index.chapters.length === 0) throw new Error('novel index must contain a non-empty chapters array')
  if (!index.sourceFingerprint || !index.chapterIndexFingerprint) throw new Error('novel index is missing source/chapter input fingerprints; rerun story:parse')
  if (fingerprintValue(index.chapters) !== index.chapterIndexFingerprint) throw new Error('novel index chapter fingerprint does not match its chapter metadata')
  if (!Array.isArray(outline?.lessons) || outline.lessons.length === 0) throw new Error('story outline must contain a non-empty lessons array')
  for (const field of ['sourceFingerprint', 'summaryFingerprint', 'inputFingerprint']) if (!outline[field]) throw new Error(`story outline is missing ${field}; rerun story:outline`)
  if (outline.sourceFingerprint !== index.sourceFingerprint) throw new Error('story outline source fingerprint does not match novel index')
  const expectedOutlineInputFingerprint = fingerprintValue({
    sourceFingerprint: outline.sourceFingerprint,
    summaryFingerprint: outline.summaryFingerprint,
    vocabularyCount: outline.vocabularyCount,
  })
  if (outline.inputFingerprint !== expectedOutlineInputFingerprint) throw new Error('story outline input fingerprint does not match its source/summary/vocabulary metadata')
}

export async function loadOrderedWordGroups(prisma) {
  return prisma.wordGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { words: { orderBy: { sortOrder: 'asc' }, include: { word: { include: { meanings: { orderBy: { id: 'asc' } } } } } } },
  })
}

export function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--index' || arg === '--index-path') options.indexPath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--outline' || arg === '--outline-path') options.outlinePath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--checkpoint-dir' || arg === '--lesson-checkpoint-dir') options.checkpointDir = resolve(requireValue(args, ++index, arg))
    else if (arg === '--report' || arg === '--report-path') options.reportPath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--progress' || arg === '--progress-path') options.progressPath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--sample' || arg === '--dry-run' || arg === '--no-persist') options.sample = true
    else if (arg === '--pre-lessons' || arg === '--write-pre-lessons') options.writePreLessons = true
    else if (arg === '--pre-lessons-only') options.preLessonsOnly = true
    else if (arg === '--from-pre-lessons' || arg === '--generate-from-pre-lessons') options.fromPreLessons = true
    else if (arg === '--pre-lessons-dir') options.preLessonsDir = resolve(requireValue(args, ++index, arg))
    else if (arg === '--lesson-output-dir' || arg === '--output-dir') options.lessonOutputDir = resolve(requireValue(args, ++index, arg))
    else if (arg === '--from' || arg === '--lesson-from') options.fromOrder = parsePositiveIntegerFlag(requireValue(args, ++index, arg), arg)
    else if (arg === '--to' || arg === '--lesson-to') options.toOrder = parsePositiveIntegerFlag(requireValue(args, ++index, arg), arg)
    else if (arg === '--max-words-per-lesson') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('--max-words-per-lesson must be an integer from 1 to 100'); options.maxWordsPerLesson = value }
    else if (arg === '--expected-word-count') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 0) throw new Error('--expected-word-count must be a non-negative integer'); options.expectedWordCount = value }
    else if (arg === '--concurrency') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1) throw new Error('--concurrency must be a positive integer'); options.concurrency = value }
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function toProgressIso(value) { const date = value instanceof Date ? value : new Date(value); return date.toISOString() }
function requireValue(args, index, flag) { const value = args[index]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`); return value }
function parsePositiveIntegerFlag(rawValue, flag) { const value = Number(rawValue); if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} must be a positive integer`); return value }
function getFirstEnv(names, env) { for (const name of names) { const value = env[name]; if (typeof value === 'string' && value.trim()) return value.trim() } return undefined }
function displayPath(path) { const relativePath = relative(PROJECT_ROOT, path); return relativePath && !relativePath.startsWith('..') ? relativePath : path }
function helpText() { return `Usage: node scripts/generate-story-lessons.mjs [options]\n\nOptions:\n  --index, --index-path PATH\n  --outline, --outline-path PATH\n  --checkpoint-dir PATH\n  --report, --report-path PATH\n  --progress, --progress-path PATH          Live progress JSON snapshot (default: scripts/.story-cache/story-generation-progress.json)\n  --sample, --dry-run, --no-persist        Generate checkpoint files only; do not create/write StoryCourse or StoryLesson rows\n  --pre-lessons                            Also write AI-input preview JSON files under lessons/pre_lessons\n  --pre-lessons-only                       Write pre_lessons JSON only; do not call AI or mutate StoryCourse/StoryLesson\n  --pre-lessons-dir PATH                   Override pre_lessons input/output directory\n  --from-pre-lessons                       Read pre_lessons/lesson-xxxx.json, call AI, and write lesson JSON files only\n  --lesson-output-dir PATH                 Output directory for --from-pre-lessons (default: --checkpoint-dir)\n  --from N --to N                          Lesson-order range for sample generation (requires --sample)\n  --expected-word-count N                 Exact corpus size (default: ${DEFAULT_EXPECTED_WORD_COUNT})\n  --max-words-per-lesson N                Per-lesson cap, 1-100 (default: 100)\n  --concurrency N                         Default 1; only 1 is supported\n  -h, --help\n\nEnvironment names only: DATABASE_URL, STORY_LLM_API_KEY/OPENAI_API_KEY/LLM_API_KEY, STORY_LLM_BASE_URL/OPENAI_BASE_URL/LLM_BASE_URL, STORY_LLM_MODEL/OPENAI_MODEL/LLM_MODEL, STORY_LLM_TRANSPORT.` }
async function createPrismaClient() { const { PrismaClient } = await import('@prisma/client'); return new PrismaClient() }
function isDirectRun() { return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href }
if (isDirectRun()) { try { await main() } catch (error) { console.error(`Failed to generate story lessons: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 } }
