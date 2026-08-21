#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLlmJsonClient } from './lib/llm-json.mjs'
import { fingerprintValue } from './lib/input-fingerprint.mjs'
import { assignWordsToOutline, generateLessonsFromAssignments } from './lib/story-lesson-generator.mjs'
import { buildWordAndMeaningMaps, createOrResumeDraftCourse, persistDraftLesson } from './lib/story-lesson-repository.mjs'
import { validateStoryOutline, writeJsonAtomic } from './lib/story-outline.mjs'
import { loadEnvFiles } from './build-story-outline.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_LESSON_CHECKPOINT_DIR = resolve(PROJECT_ROOT, 'scripts/.story-cache/lessons')
export const DEFAULT_REPORT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-generation-report.json')
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
  const maxWordsPerLesson = options.maxWordsPerLesson ?? 100
  const concurrency = options.concurrency ?? 1
  const expectedWordCount = options.expectedWordCount ?? DEFAULT_EXPECTED_WORD_COUNT
  const fileExists = dependencies.existsSync ?? existsSync
  const readJson = dependencies.readJson ?? (async (path) => JSON.parse(await readFile(path, 'utf8')))

  if (concurrency !== 1) throw new Error('story:generate currently supports --concurrency 1 only to preserve lesson continuity')
  if (!fileExists(indexPath)) throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  if (!fileExists(outlinePath)) throw new Error(`story outline not found: ${displayPath(outlinePath)}`)
  const index = await readJson(indexPath)
  const outline = await readJson(outlinePath)
  assertFingerprintBoundInputs(index, outline)
  validateStoryOutline(outline, [], { sourceChapters: index.chapters })

  const prisma = dependencies.prisma ?? await createPrismaClient()
  const ownsPrisma = !dependencies.prisma
  try {
    const loadGroups = dependencies.loadOrderedWordGroups ?? loadOrderedWordGroups
    const wordGroups = await loadGroups(prisma)
    const { wordMap, meaningMap } = buildWordAndMeaningMaps(wordGroups)
    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson })
    if (assignmentResult.report.totalWords !== expectedWordCount) throw new Error(`expected exactly ${expectedWordCount} vocabulary words but loaded ${assignmentResult.report.totalWords}`)
    if (assignmentResult.unassignedWords.length > 0) throw new Error(`outline capacity left ${assignmentResult.unassignedWords.length} words unassigned`)

    const fingerprints = computeCourseFingerprints({ index, outline, assignments: assignmentResult.assignments })
    const createDraft = dependencies.createOrResumeDraftCourse ?? createOrResumeDraftCourse
    const course = await createDraft({ prisma, fingerprints })
    if (course.status !== 'draft') throw new Error(`generation requires a draft course; received ${course.status}`)

    const existingLessons = await prisma.storyLesson.findMany({ where: { courseId: course.id }, orderBy: { order: 'asc' } })
    const existingLessonsByOrder = new Map(existingLessons.map((lesson) => [lesson.order, lesson]))
    const firstNonReady = assignmentResult.assignments.find((assignment) => existingLessonsByOrder.get(assignment.lessonOrder)?.status !== 'ready')
    const generateJson = dependencies.generateJson ?? createLlmJsonClient({
      apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY'], env),
      baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL'], env),
      model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL'], env) ?? DEFAULT_MODEL,
      transport: getFirstEnv(['STORY_LLM_TRANSPORT'], env) ?? 'auto',
    }).generateJson
    const persist = dependencies.persistDraftLesson ?? persistDraftLesson
    const generatedLessons = await generateLessonsFromAssignments({
      assignments: assignmentResult.assignments,
      generateJson,
      checkpointDir: resolve(checkpointDir, `course-${course.version}`),
      existingLessonsByOrder,
      maxWordsPerLesson,
      persistLesson: (lessonDocument) => persist({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    })

    const report = {
      version: 2,
      generatedAt: new Date().toISOString(),
      courseId: course.id,
      courseVersion: course.version,
      courseStatus: 'draft',
      indexPath: displayPath(indexPath),
      outlinePath: displayPath(outlinePath),
      chapterCount: index.chapters.length,
      lessonCount: assignmentResult.assignments.length,
      wordCount: assignmentResult.report.totalWords,
      assignedWordCount: assignmentResult.report.assignedWordCount,
      unassignedWordCount: assignmentResult.report.unassignedWordCount,
      duplicateWordTexts: assignmentResult.report.duplicateWordTexts,
      firstNonReadyLessonOrder: firstNonReady?.lessonOrder ?? null,
      generatedLessonCount: generatedLessons.length,
      maxWordsPerLesson,
      fingerprints,
    }
    await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
    log(`Draft story course v${course.version} lessons processed: ${generatedLessons.length}`)
    log(`Vocabulary assigned: ${assignmentResult.report.assignedWordCount}`)
    log(`Generation report written: ${displayPath(reportPath)}`)
    return report
  } finally {
    if (ownsPrisma) await prisma.$disconnect()
  }
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
    else if (arg === '--max-words-per-lesson') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('--max-words-per-lesson must be an integer from 1 to 100'); options.maxWordsPerLesson = value }
    else if (arg === '--expected-word-count') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 0) throw new Error('--expected-word-count must be a non-negative integer'); options.expectedWordCount = value }
    else if (arg === '--concurrency') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1) throw new Error('--concurrency must be a positive integer'); options.concurrency = value }
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function requireValue(args, index, flag) { const value = args[index]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`); return value }
function getFirstEnv(names, env) { for (const name of names) { const value = env[name]; if (typeof value === 'string' && value.trim()) return value.trim() } return undefined }
function displayPath(path) { const relativePath = relative(PROJECT_ROOT, path); return relativePath && !relativePath.startsWith('..') ? relativePath : path }
function helpText() { return `Usage: node scripts/generate-story-lessons.mjs [options]\n\nOptions:\n  --index, --index-path PATH\n  --outline, --outline-path PATH\n  --checkpoint-dir PATH\n  --report, --report-path PATH\n  --expected-word-count N                 Exact corpus size (default: ${DEFAULT_EXPECTED_WORD_COUNT})\n  --max-words-per-lesson N                Per-lesson cap, 1-100 (default: 100)\n  --concurrency N                         Default 1; only 1 is supported\n  -h, --help\n\nEnvironment names only: DATABASE_URL, STORY_LLM_API_KEY/OPENAI_API_KEY/LLM_API_KEY, STORY_LLM_BASE_URL/OPENAI_BASE_URL/LLM_BASE_URL, STORY_LLM_MODEL/OPENAI_MODEL/LLM_MODEL, STORY_LLM_TRANSPORT.` }
async function createPrismaClient() { const { PrismaClient } = await import('@prisma/client'); return new PrismaClient() }
function isDirectRun() { return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href }
if (isDirectRun()) { try { await main() } catch (error) { console.error(`Failed to generate story lessons: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 } }
