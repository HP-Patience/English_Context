#!/usr/bin/env node
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeJsonAtomic } from './lib/story-outline.mjs'
import { buildWordAndMeaningMaps } from './lib/story-lesson-repository.mjs'
import { collectTargetWordSegments, parseLessonContent, validateCorpus } from './lib/story-lesson-generator.mjs'
import { loadEnvFiles } from './build-story-outline.mjs'
import { loadOrderedWordGroups } from './generate-story-lessons.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_REPORT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-validation-report.json')
export const DEFAULT_EXPECTED_WORD_COUNT = 6098

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')])

  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH
  const expectedWordCount = options.expectedWordCount ?? DEFAULT_EXPECTED_WORD_COUNT
  const minLessons = options.minLessons ?? 61
  const maxLessons = options.maxLessons ?? 150
  const maxWordsPerLesson = options.maxWordsPerLesson ?? 100

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  try {
    const wordGroups = await loadOrderedWordGroups(prisma)
    const { wordMap } = buildWordAndMeaningMaps(wordGroups)
    const lessons = await prisma.storyLesson.findMany({
      orderBy: { order: 'asc' },
      include: {
        words: {
          orderBy: { sortOrder: 'asc' },
          include: { word: true, meaning: true },
        },
      },
    })

    const report = validateReadyLessons({
      lessons,
      allWordTexts: [...wordMap.keys()],
      expectedWordCount,
      minLessons,
      maxLessons,
      maxWordsPerLesson,
    })

    await writeJsonAtomic(reportPath, report)
    console.log(`Validation ${report.ok ? 'passed' : 'failed'}: ${report.errors.length} error(s)`)
    console.log(`Validation report written: ${displayPath(reportPath)}`)
    if (!report.ok) {
      process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()
  }
}

export function validateReadyLessons({ lessons, allWordTexts, expectedWordCount = DEFAULT_EXPECTED_WORD_COUNT, minLessons = 61, maxLessons = 150, maxWordsPerLesson = 100 }) {
  const report = validateCorpus({
    lessons,
    allWordTexts,
    expectedWordCount,
    minLessons,
    maxLessons,
    maxWordsPerLesson,
    requireReadyStatus: true,
  })

  const seenLessonWordLinks = new Set()
  for (const [lessonIndex, lesson] of (lessons ?? []).entries()) {
    const lessonLabel = `lessons[${lessonIndex}] order ${lesson?.order ?? 'unknown'}`
    const targetSegments = readTargetSegmentsForValidation(lesson, lessonLabel, report.errors)
    const rows = Array.isArray(lesson?.words) ? lesson.words : []

    if (targetSegments.length !== rows.length) {
      report.errors.push(`${lessonLabel} has ${targetSegments.length} target segments but ${rows.length} StoryLessonWord rows`)
    }

    const segmentsByWordOrder = new Map(targetSegments.map((segment) => [segment.wordOrder, segment]))
    const rowsBySortOrder = new Map()

    for (const row of rows) {
      const key = `${row.lessonId}:${row.wordId}`
      if (seenLessonWordLinks.has(key)) {
        report.errors.push(`duplicate lesson-word link: ${key}`)
      }
      seenLessonWordLinks.add(key)

      if (rowsBySortOrder.has(row.sortOrder)) {
        report.errors.push(`${lessonLabel} has duplicate StoryLessonWord sortOrder ${row.sortOrder}`)
      } else {
        rowsBySortOrder.set(row.sortOrder, row)
      }

      const segment = segmentsByWordOrder.get(row.sortOrder)
      if (!segment) {
        report.errors.push(`${lessonLabel} has extra StoryLessonWord row ${row.id ?? row.wordId} at sortOrder ${row.sortOrder}`)
      }

      if (row.meaning?.wordId && row.meaning.wordId !== row.wordId) {
        report.errors.push(`meaning ${row.meaningId} does not belong to linked word ${row.wordId}`)
      }
    }

    for (const segment of targetSegments) {
      const row = rowsBySortOrder.get(segment.wordOrder)
      if (!row) {
        report.errors.push(`${lessonLabel} is missing StoryLessonWord row for target word ${segment.word} at wordOrder ${segment.wordOrder}`)
        continue
      }

      const rowText = row.word?.text
      if (rowText !== segment.word) {
        report.errors.push(`${lessonLabel} StoryLessonWord row word ${rowText ?? 'unknown'} does not match content target word ${segment.word} at wordOrder ${segment.wordOrder}`)
      }
      if (row.glossCn !== segment.definitionCn) {
        report.errors.push(`${lessonLabel} StoryLessonWord row glossCn ${row.glossCn} does not match content gloss ${segment.definitionCn} at wordOrder ${segment.wordOrder}`)
      }
    }
  }

  report.ok = report.errors.length === 0
  report.lessonWordLinkCount = seenLessonWordLinks.size
  report.generatedAt = new Date().toISOString()
  return report
}

function readTargetSegmentsForValidation(lesson, lessonLabel, errors) {
  try {
    return collectTargetWordSegments(parseLessonContent(lesson))
  } catch (error) {
    errors.push(`${lessonLabel} contentJson is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}


export function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--report' || arg === '--report-path') {
      options.reportPath = resolve(requireValue(args, ++index, arg))
      continue
    }
    if (arg === '--expected-word-count') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 0) throw new Error('--expected-word-count must be a non-negative integer')
      options.expectedWordCount = value
      continue
    }
    if (arg === '--min-lessons') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 1) throw new Error('--min-lessons must be a positive integer')
      options.minLessons = value
      continue
    }
    if (arg === '--max-lessons') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 1) throw new Error('--max-lessons must be a positive integer')
      options.maxLessons = value
      continue
    }
    if (arg === '--max-words-per-lesson') {
      const value = Number(requireValue(args, ++index, arg))
      if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('--max-words-per-lesson must be an integer from 1 to 100')
      options.maxWordsPerLesson = value
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

function displayPath(path) {
  const relativePath = relative(PROJECT_ROOT, path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

function printHelp() {
  console.log(`Usage: node scripts/validate-story-lessons.mjs [options]

Options:
  --report, --report-path PATH            Validation report path (default: scripts/.story-cache/story-validation-report.json)
  --expected-word-count N                 Required corpus word count (default: ${DEFAULT_EXPECTED_WORD_COUNT})
  --min-lessons N                         Minimum ready lesson count (default: 61)
  --max-lessons N                         Maximum ready lesson count (default: 150)
  --max-words-per-lesson N                Per-lesson cap, 1-100 (default: 100)
  -h, --help                              Show this help

Environment:
  DATABASE_URL`)
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  try {
    await main()
  } catch (error) {
    console.error(`Failed to validate story lessons: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
