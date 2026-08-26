#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLlmJsonClient } from './lib/llm-json.mjs'
import { fingerprintBytes, fingerprintValue } from './lib/input-fingerprint.mjs'
import { cleanNovelText, decodeNovelBuffer, parseChapters } from './lib/novel-parser.mjs'
import { buildChapterSummaries, buildStoryOutline, writeJsonAtomic } from './lib/story-outline.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_SOURCE_PATH = resolve(PROJECT_ROOT, 'data/local/story/蛊真人.txt')
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_DIR = resolve(PROJECT_ROOT, 'scripts/.story-cache/outline')
export const DEFAULT_CHAPTER_SUMMARY_CHECKPOINT_PATH = resolve(DEFAULT_OUTLINE_DIR, 'chapter-summaries.json')
export const DEFAULT_OUTLINE_CHECKPOINT_PATH = resolve(DEFAULT_OUTLINE_DIR, 'story-outline.checkpoint.json')
export const DEFAULT_OUTPUT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_VOCABULARY_PATH = resolve(PROJECT_ROOT, 'data/2026考研英语词汇闪过.txt')
export const DEFAULT_MODEL = 'gpt-4.1-mini'

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args)
  const log = dependencies.log ?? console.log
  if (options.help) {
    log(helpText())
    return { help: true }
  }

  const env = dependencies.env ?? process.env
  if (dependencies.loadEnvironment !== false) {
    loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')], env)
  }

  const sourcePath = options.sourcePath ?? DEFAULT_SOURCE_PATH
  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH
  const chapterCheckpointPath = options.chapterCheckpointPath ?? DEFAULT_CHAPTER_SUMMARY_CHECKPOINT_PATH
  const outlineCheckpointPath = options.outlineCheckpointPath ?? DEFAULT_OUTLINE_CHECKPOINT_PATH
  const fileExists = dependencies.existsSync ?? existsSync
  const readBytes = dependencies.readFile ?? readFile
  const readJson = dependencies.readJson ?? (async (path) => JSON.parse(await readFile(path, 'utf8')))
  const vocabularyCount = options.vocabularyCount ?? await (dependencies.readVocabularyCount ?? readVocabularyCount)(options.vocabularyPath ?? DEFAULT_VOCABULARY_PATH)

  if (!fileExists(indexPath)) throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  if (!fileExists(sourcePath)) throw new Error(`source novel not found: ${sourcePath}`)

  const index = await readJson(indexPath)
  if (!Array.isArray(index.chapters) || index.chapters.length === 0) throw new Error('novel index must contain a non-empty chapters array')
  if (!index.sourceFingerprint || !index.chapterIndexFingerprint) throw new Error('novel index is missing input fingerprints; rerun story:parse')
  if (fingerprintValue(index.chapters) !== index.chapterIndexFingerprint) throw new Error('novel index chapter fingerprint does not match its chapter metadata')

  const sourceBytes = await readBytes(sourcePath)
  const sourceFingerprint = fingerprintBytes(sourceBytes)
  if (sourceFingerprint !== index.sourceFingerprint) throw new Error('raw novel source fingerprint does not match the parsed index; rerun story:parse')
  const chapters = await (dependencies.loadSourceChapters ?? loadSourceChapters)({ sourcePath, sourceBytes, indexChapters: index.chapters })

  const generateJson = dependencies.generateJson ?? (dependencies.createLlmJsonClient ?? createLlmJsonClient)({
    apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY'], env),
    baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL'], env),
    model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL'], env) ?? DEFAULT_MODEL,
    transport: getFirstEnv(['STORY_LLM_TRANSPORT'], env) ?? 'responses',
  }).generateJson

  const chapterSummaries = await (dependencies.buildChapterSummaries ?? buildChapterSummaries)({
    chapters,
    generateJson,
    checkpointPath: chapterCheckpointPath,
    sourceFingerprint,
    allowDeterministicFallback: true,
  })

  const outline = await (dependencies.buildStoryOutline ?? buildStoryOutline)({
    chapterSummaries,
    vocabularyCount,
    generateJson,
    checkpointPath: outlineCheckpointPath,
    sourceFingerprint,
    sourceChapters: index.chapters,
  })

  await (dependencies.writeJsonAtomic ?? writeJsonAtomic)(outputPath, outline)

  log(`Chapter summaries: ${chapterSummaries.length}`)
  log(`Outline lessons: ${outline.lessons.length}`)
  log(`Vocabulary count: ${vocabularyCount}`)
  log(`Story outline written: ${displayPath(outputPath)}`)
  return outline
}

export function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--source' || arg === '--source-path') {
      options.sourcePath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--index' || arg === '--index-path') {
      options.indexPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--output' || arg === '--output-path') {
      options.outputPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--chapter-checkpoint') {
      options.chapterCheckpointPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--outline-checkpoint') {
      options.outlineCheckpointPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--vocabulary-path') {
      options.vocabularyPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--vocabulary-count') {
      const rawValue = requireValue(args, ++index, arg)
      const value = Number(rawValue)
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--vocabulary-count must be a non-negative integer')
      }
      options.vocabularyCount = value
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    throw new Error(`unknown argument: ${arg}`)
  }

  return options
}

export async function loadSourceChapters({ sourcePath, sourceBytes, indexChapters }) {
  if (!sourcePath) {
    throw new TypeError('loadSourceChapters requires sourcePath')
  }
  if (!Array.isArray(indexChapters) || indexChapters.length === 0) {
    throw new TypeError('loadSourceChapters requires a non-empty indexChapters array')
  }

  const bytes = sourceBytes ?? await readFile(sourcePath)
  const parsedChapters = parseChapters(cleanNovelText(decodeNovelBuffer(bytes)))
  const parsedByOrder = new Map(parsedChapters.map((chapter) => [chapter.order, chapter]))
  const chapters = []

  for (const indexed of indexChapters) {
    const order = Number(indexed?.order)
    if (!Number.isInteger(order) || order < 1) {
      throw new Error('novel index contains a chapter without a positive integer order')
    }
    const parsed = parsedByOrder.get(order)
    if (!parsed || typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
      throw new Error(`source novel did not provide body text for indexed chapter ${order}`)
    }
    chapters.push({
      ...indexed,
      order,
      title: typeof indexed.title === 'string' && indexed.title.trim() ? indexed.title.trim() : parsed.title,
      characterCount: indexed.characterCount ?? parsed.text.length,
      text: parsed.text,
    })
  }

  return chapters
}

export async function readVocabularyCount(path) {
  try {
    const text = await readFile(path, 'utf8')
    const words = new Set()
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      words.add(trimmed)
    }
    return words.size
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0
    }
    throw error
  }
}

export function loadEnvFiles(paths, targetEnv = process.env) {
  const protectedKeys = new Set(Object.keys(targetEnv))
  const loaded = {}

  for (const path of paths) {
    if (!existsSync(path)) {
      continue
    }
    Object.assign(loaded, readEnvFileSync(path))
  }

  for (const [key, value] of Object.entries(loaded)) {
    if (!protectedKeys.has(key)) {
      targetEnv[key] = value
    }
  }
}

function readEnvFileSync(path) {
  const env = {}
  const text = readFileSync(path, 'utf8')

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }
    const key = line.slice(0, equalsIndex).trim()
    let value = line.slice(equalsIndex + 1).trim()
    value = stripInlineComment(unquoteEnvValue(value))
    env[key] = value
  }

  return env
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function stripInlineComment(value) {
  const match = value.match(/^(.*?)(?:\s+#.*)$/)
  return (match ? match[1] : value).trim()
}

function getFirstEnv(names, env = process.env) {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function requireValue(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function displayPath(path) {
  const relativePath = relative(PROJECT_ROOT, path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

export function helpText() {
  return `Usage: node scripts/build-story-outline.mjs [options]

Options:
  --source, --source-path PATH          GB18030 raw novel source (default: ${DEFAULT_SOURCE_PATH})
  --index, --index-path PATH            Metadata-only chapter index (default: scripts/.story-cache/novel-index.json)
  --output, --output-path PATH          Final outline output (default: scripts/.story-cache/story-outline.json)
  --chapter-checkpoint PATH             Chapter-summary checkpoint (default: scripts/.story-cache/outline/chapter-summaries.json)
  --outline-checkpoint PATH             Final-outline checkpoint (default: scripts/.story-cache/outline/story-outline.checkpoint.json)
  --vocabulary-path PATH                Vocabulary source for unique word count (default: data/2026考研英语词汇闪过.txt)
  --vocabulary-count N                  Explicit non-negative vocabulary count
  -h, --help                            Show this help

Environment:
  STORY_LLM_API_KEY / OPENAI_API_KEY / LLM_API_KEY
  STORY_LLM_BASE_URL / OPENAI_BASE_URL / LLM_BASE_URL
  STORY_LLM_MODEL / OPENAI_MODEL / LLM_MODEL (default: ${DEFAULT_MODEL})
  STORY_LLM_TRANSPORT (default: responses)

Exported shell environment values take precedence over .env and .env.local.`
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  try {
    await main()
  } catch (error) {
    console.error(`Failed to build story outline: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
