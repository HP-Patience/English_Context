#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLlmJsonClient } from './lib/llm-json.mjs'
import { assignWordsToOutline, generateLessonsFromAssignments } from './lib/story-lesson-generator.mjs'
import { buildWordAndMeaningMaps, persistReadyLesson } from './lib/story-lesson-repository.mjs'
import { writeJsonAtomic } from './lib/story-outline.mjs'
import { loadEnvFiles } from './build-story-outline.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_LESSON_CHECKPOINT_DIR = resolve(PROJECT_ROOT, 'scripts/.story-cache/lessons')
export const DEFAULT_REPORT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-generation-report.json')
export const DEFAULT_MODEL = 'gpt-4.1-mini'

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')])

  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const outlinePath = options.outlinePath ?? DEFAULT_OUTLINE_PATH
  const checkpointDir = options.checkpointDir ?? DEFAULT_LESSON_CHECKPOINT_DIR
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH
  const maxWordsPerLesson = options.maxWordsPerLesson ?? 100
  const concurrency = options.concurrency ?? 1

  if (concurrency !== 1) {
    throw new Error('story:generate currently supports --concurrency 1 only to preserve lesson continuity')
  }
  if (!existsSync(indexPath)) {
    throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  }
  if (!existsSync(outlinePath)) {
    throw new Error(`story outline not found: ${displayPath(outlinePath)}`)
  }

  const index = JSON.parse(await readFile(indexPath, 'utf8'))
  if (!Array.isArray(index.chapters) || index.chapters.length === 0) {
    throw new Error('novel index must contain a non-empty chapters array')
  }
  const outline = JSON.parse(await readFile(outlinePath, 'utf8'))
  if (!Array.isArray(outline.lessons) || outline.lessons.length === 0) {
    throw new Error('story outline must contain a non-empty lessons array')
  }

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  try {
    const wordGroups = await loadOrderedWordGroups(prisma)
    const { wordMap, meaningMap } = buildWordAndMeaningMaps(wordGroups)
    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson })

    if (assignmentResult.unassignedWords.length > 0) {
      throw new Error(`outline capacity left ${assignmentResult.unassignedWords.length} words unassigned`)
    }

    const existingLessons = await prisma.storyLesson.findMany({ orderBy: { order: 'asc' } })
    const existingLessonsByOrder = new Map(existingLessons.map((lesson) => [lesson.order, lesson]))
    const firstNonReady = assignmentResult.assignments.find((assignment) => existingLessonsByOrder.get(assignment.lessonOrder)?.status !== 'ready')

    const llm = createLlmJsonClient({
      apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY']),
      baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL']),
      model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL']) ?? DEFAULT_MODEL,
    })

    const generatedLessons = await generateLessonsFromAssignments({
      assignments: assignmentResult.assignments,
      generateJson: llm.generateJson,
      checkpointDir,
      existingLessonsByOrder,
      maxWordsPerLesson,
      persistLesson: async (lessonDocument) => persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap }),
    })

    const report = {
      version: 1,
      generatedAt: new Date().toISOString(),
      indexPath: displayPath(indexPath),
      outlinePath: displayPath(outlinePath),
      chapterCount: index.chapters.length,
      lessonCount: assignmentResult.assignments.length,
      wordCount: assignmentResult.report.totalWords,
      assignedWordCount: assignmentResult.report.assignedWordCount,
      unassignedWordCount: assignmentResult.report.unassignedWordCount,
      duplicateWordTexts: assignmentResult.report.duplicateWordTexts,
      firstNonReadyLessonOrder: firstNonReady?.lessonOrder ?? null,
      readyLessonCount: generatedLessons.length,
      maxWordsPerLesson,
    }
    await writeJsonAtomic(reportPath, report)

    console.log(`Story lessons processed: ${generatedLessons.length}`)
    console.log(`Vocabulary assigned: ${assignmentResult.report.assignedWordCount}`)
    console.log(`Generation report written: ${displayPath(reportPath)}`)
  } finally {
    await prisma.$disconnect()
  }
}

export async function loadOrderedWordGroups(prisma) {
  return prisma.wordGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        orderBy: { sortOrder: 'asc' },
        include: {
          word: {
            include: {
              meanings: { orderBy: { id: 'asc' } },
            },
          },
        },
      },
    },
  })
}

export function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--index' || arg === '--index-path') {
      options.indexPath = resolve(requireValue(args, ++index, arg))
      continue
    }
    if (arg === '--outline' || arg === '--outline-path') {
      options.outlinePath = resolve(requireValue(args, ++index, arg))
      continue
    }
    if (arg === '--checkpoint-dir' || arg === '--lesson-checkpoint-dir') {
      options.checkpointDir = resolve(requireValue(args, ++index, arg))
      continue
    }
    if (arg === '--report' || arg === '--report-path') {
      options.reportPath = resolve(requireValue(args, ++index, arg))
      continue
    }
    if (arg === '--max-words-per-lesson') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error('--max-words-per-lesson must be an integer from 1 to 100')
      }
      options.maxWordsPerLesson = value
      continue
    }
    if (arg === '--concurrency') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--concurrency must be a positive integer')
      }
      options.concurrency = value
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

function requireValue(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function getFirstEnv(names) {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function displayPath(path) {
  const relativePath = relative(PROJECT_ROOT, path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

function printHelp() {
  console.log(`Usage: node scripts/generate-story-lessons.mjs [options]

Options:
  --index, --index-path PATH              Metadata-only novel index (default: scripts/.story-cache/novel-index.json)
  --outline, --outline-path PATH          Story outline JSON (default: scripts/.story-cache/story-outline.json)
  --checkpoint-dir PATH                   Lesson JSON checkpoint dir (default: scripts/.story-cache/lessons)
  --report, --report-path PATH            Generation report path (default: scripts/.story-cache/story-generation-report.json)
  --max-words-per-lesson N                Per-lesson cap, 1-100 (default: 100)
  --concurrency N                         Bounded generation concurrency (default: 1; only 1 currently supported)
  -h, --help                              Show this help

Environment:
  DATABASE_URL
  STORY_LLM_API_KEY / OPENAI_API_KEY / LLM_API_KEY
  STORY_LLM_BASE_URL / OPENAI_BASE_URL / LLM_BASE_URL
  STORY_LLM_MODEL / OPENAI_MODEL / LLM_MODEL (default: ${DEFAULT_MODEL})`)
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  try {
    await main()
  } catch (error) {
    console.error(`Failed to generate story lessons: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
