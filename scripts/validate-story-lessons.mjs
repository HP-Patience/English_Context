#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeJsonAtomic, validateStoryOutline } from './lib/story-outline.mjs'
import {
  StoryCourseValidationError,
  buildWordAndMeaningMaps,
  findLatestDraftCourse,
  publishDraftCourse,
} from './lib/story-lesson-repository.mjs'
import { assertLessonTargetsMatchAssignment, assignWordsToOutline, collectTargetWordSegments, parseLessonContent, validateCorpus } from './lib/story-lesson-generator.mjs'
import { loadEnvFiles } from './build-story-outline.mjs'
import { assertFingerprintBoundInputs, computeCourseFingerprints, loadOrderedWordGroups } from './generate-story-lessons.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_REPORT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-validation-report.json')
export const DEFAULT_EXPECTED_WORD_COUNT = 6098

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args)
  const log = dependencies.log ?? console.log
  if (options.help) { log(helpText()); return { help: true } }
  const env = dependencies.env ?? process.env
  if (dependencies.loadEnvironment !== false) loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')], env)

  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH
  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const outlinePath = options.outlinePath ?? DEFAULT_OUTLINE_PATH
  const expectedWordCount = options.expectedWordCount ?? DEFAULT_EXPECTED_WORD_COUNT
  const minLessons = options.minLessons ?? 61
  const maxLessons = options.maxLessons ?? 150
  const maxWordsPerLesson = options.maxWordsPerLesson ?? 100
  const fileExists = dependencies.existsSync ?? existsSync
  const readJson = dependencies.readJson ?? (async (path) => JSON.parse(await readFile(path, 'utf8')))
  if (!fileExists(indexPath)) throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  if (!fileExists(outlinePath)) throw new Error(`story outline not found: ${displayPath(outlinePath)}`)
  const index = await readJson(indexPath)
  const outline = await readJson(outlinePath)
  assertFingerprintBoundInputs(index, outline)

  const prisma = dependencies.prisma ?? await createPrismaClient()
  const ownsPrisma = !dependencies.prisma
  try {
    const wordGroups = await (dependencies.loadOrderedWordGroups ?? loadOrderedWordGroups)(prisma)
    const { wordMap } = buildWordAndMeaningMaps(wordGroups)
    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson })
    const fingerprints = computeCourseFingerprints({ index, outline, assignments: assignmentResult.assignments })
    const draftCourse = options.courseId
      ? await prisma.storyCourse.findUnique({ where: { id: options.courseId } })
      : await (dependencies.findLatestDraftCourse ?? findLatestDraftCourse)(prisma)
    if (!draftCourse) throw new Error(options.courseId ? `draft story course not found: ${options.courseId}` : 'no draft story course found')

    const validateCourse = (course) => {
      const outlineErrors = []
      try { validateStoryOutline(outline, [], { sourceChapters: index.chapters }) } catch (error) { outlineErrors.push(error instanceof Error ? error.message : String(error)) }
      for (const [field, expected] of Object.entries(fingerprints)) if (course[field] !== expected) outlineErrors.push(`course ${field} does not match current input`)
      if (assignmentResult.report.totalWords !== expectedWordCount) outlineErrors.push(`expected exactly ${expectedWordCount} vocabulary words but loaded ${assignmentResult.report.totalWords}`)
      if (assignmentResult.unassignedWords.length > 0) outlineErrors.push(`outline capacity left ${assignmentResult.unassignedWords.length} words unassigned`)
      const report = validateReadyLessons({
        courseId: course.id,
        lessons: course.lessons,
        assignments: assignmentResult.assignments,
        allWordTexts: [...wordMap.keys()],
        expectedWordCount,
        minLessons,
        maxLessons,
        maxWordsPerLesson,
        sourceChapters: index.chapters,
      })
      report.errors.unshift(...outlineErrors)
      report.ok = report.errors.length === 0
      report.courseId = course.id
      report.courseVersion = course.version
      report.fingerprints = fingerprints
      return report
    }

    try {
      const publication = await (dependencies.publishDraftCourse ?? publishDraftCourse)({ prisma, courseId: draftCourse.id, validateCourse })
      const report = { ...publication.report, published: true, publishedCourseId: publication.course.id, publishedCourseVersion: publication.course.version }
      await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
      log(`Validation passed and course v${publication.course.version} published: 0 error(s)`)
      log(`Validation report written: ${displayPath(reportPath)}`)
      return report
    } catch (error) {
      if (error instanceof StoryCourseValidationError || error?.report) {
        const report = { ...error.report, published: false }
        await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(reportPath, report)
        log(`Validation failed: ${report.errors.length} error(s); published course unchanged`)
        log(`Validation report written: ${displayPath(reportPath)}`)
      }
      throw error
    }
  } finally {
    if (ownsPrisma) await prisma.$disconnect()
  }
}

export function validateReadyLessons({ courseId, lessons, assignments, allWordTexts, expectedWordCount = DEFAULT_EXPECTED_WORD_COUNT, minLessons = 61, maxLessons = 150, maxWordsPerLesson = 100, sourceChapters }) {
  const report = validateCorpus({ lessons, allWordTexts, expectedWordCount, minLessons, maxLessons, maxWordsPerLesson, requireReadyStatus: true, sourceChapters })
  const seenLessonWordLinks = new Set()
  for (const [lessonIndex, lesson] of (lessons ?? []).entries()) {
    const lessonLabel = `lessons[${lessonIndex}] order ${lesson?.order ?? 'unknown'}`
    if (courseId && lesson?.courseId !== courseId) report.errors.push(`${lessonLabel} belongs to course ${lesson?.courseId ?? 'unknown'} instead of ${courseId}`)
    const targetSegments = readTargetSegmentsForValidation(lesson, lessonLabel, report.errors)
    const rows = Array.isArray(lesson?.words) ? lesson.words : []
    if (targetSegments.length !== rows.length) report.errors.push(`${lessonLabel} has ${targetSegments.length} target segments but ${rows.length} StoryLessonWord rows`)
    const segmentsByWordOrder = new Map(targetSegments.map((segment) => [segment.wordOrder, segment]))
    const rowsBySortOrder = new Map()
    for (const row of rows) {
      const key = `${row.lessonId}:${row.wordId}`
      if (seenLessonWordLinks.has(key)) report.errors.push(`duplicate lesson-word link: ${key}`)
      seenLessonWordLinks.add(key)
      if (rowsBySortOrder.has(row.sortOrder)) report.errors.push(`${lessonLabel} has duplicate StoryLessonWord sortOrder ${row.sortOrder}`)
      else rowsBySortOrder.set(row.sortOrder, row)
      if (!segmentsByWordOrder.has(row.sortOrder)) report.errors.push(`${lessonLabel} has extra StoryLessonWord row ${row.id ?? row.wordId} at sortOrder ${row.sortOrder}`)
      if (row.meaning?.wordId && row.meaning.wordId !== row.wordId) report.errors.push(`meaning ${row.meaningId} does not belong to linked word ${row.wordId}`)
    }
    for (const segment of targetSegments) {
      const row = rowsBySortOrder.get(segment.wordOrder)
      if (!row) { report.errors.push(`${lessonLabel} is missing StoryLessonWord row for target word ${segment.word} at wordOrder ${segment.wordOrder}`); continue }
      if (row.word?.text !== segment.word) report.errors.push(`${lessonLabel} StoryLessonWord row word ${row.word?.text ?? 'unknown'} does not match content target word ${segment.word} at wordOrder ${segment.wordOrder}`)
      if (row.glossCn !== segment.definitionCn) report.errors.push(`${lessonLabel} StoryLessonWord row glossCn ${row.glossCn} does not match content gloss ${segment.definitionCn} at wordOrder ${segment.wordOrder}`)
      const persistedPhonetic = typeof row.word?.phonetic === 'string' ? row.word.phonetic.trim() : ''
      const contentPhonetic = typeof segment.phonetic === 'string' ? segment.phonetic.trim() : ''
      if (!persistedPhonetic) report.errors.push(`${lessonLabel} StoryLessonWord row word ${segment.word} must have a non-empty persisted phonetic`)
      else if (contentPhonetic && persistedPhonetic !== contentPhonetic) report.errors.push(`${lessonLabel} StoryLessonWord row word ${segment.word} persisted phonetic ${persistedPhonetic} does not match content phonetic ${contentPhonetic}`)
    }
    const assignment = assignments?.[lessonIndex]
    if (assignment) {
      try { assertLessonTargetsMatchAssignment(parseLessonContent(lesson), assignment.words, assignment.outlineLesson) }
      catch (error) { report.errors.push(`${lessonLabel} does not match assignment: ${error instanceof Error ? error.message : String(error)}`) }
    }
  }
  report.ok = report.errors.length === 0
  report.lessonWordLinkCount = seenLessonWordLinks.size
  report.generatedAt = new Date().toISOString()
  return report
}

function readTargetSegmentsForValidation(lesson, lessonLabel, errors) { try { return collectTargetWordSegments(parseLessonContent(lesson)) } catch (error) { errors.push(`${lessonLabel} contentJson is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); return [] } }

export function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--report' || arg === '--report-path') options.reportPath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--index' || arg === '--index-path') options.indexPath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--outline' || arg === '--outline-path') options.outlinePath = resolve(requireValue(args, ++index, arg))
    else if (arg === '--course-id') options.courseId = requireValue(args, ++index, arg)
    else if (arg === '--expected-word-count') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 0) throw new Error('--expected-word-count must be a non-negative integer'); options.expectedWordCount = value }
    else if (arg === '--min-lessons') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1) throw new Error('--min-lessons must be a positive integer'); options.minLessons = value }
    else if (arg === '--max-lessons') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1) throw new Error('--max-lessons must be a positive integer'); options.maxLessons = value }
    else if (arg === '--max-words-per-lesson') { const value = Number(requireValue(args, ++index, arg)); if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('--max-words-per-lesson must be an integer from 1 to 100'); options.maxWordsPerLesson = value }
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return options
}
function requireValue(args, index, flag) { const value = args[index]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`); return value }
function displayPath(path) { const relativePath = relative(PROJECT_ROOT, path); return relativePath && !relativePath.startsWith('..') ? relativePath : path }
function helpText() { return `Usage: node scripts/validate-story-lessons.mjs [options]\n\nValidates one draft course inside the publication transaction. On success it archives the prior ready course and publishes this version atomically.\n\nOptions:\n  --index PATH\n  --outline PATH\n  --course-id ID                         Default: latest draft\n  --report PATH\n  --expected-word-count N                Default: ${DEFAULT_EXPECTED_WORD_COUNT}\n  --min-lessons N                        Default: 61\n  --max-lessons N                        Default: 150\n  --max-words-per-lesson N               Default: 100\n  -h, --help` }
async function createPrismaClient() { const { PrismaClient } = await import('@prisma/client'); return new PrismaClient() }
function isDirectRun() { return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href }
if (isDirectRun()) { try { await main() } catch (error) { console.error(`Failed to validate/publish story course: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 } }
