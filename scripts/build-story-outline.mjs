#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLlmJsonClient } from './lib/llm-json.mjs'
import { buildChapterSummaries, buildStoryOutline, writeJsonAtomic } from './lib/story-outline.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_INDEX_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_OUTLINE_DIR = resolve(PROJECT_ROOT, 'scripts/.story-cache/outline')
export const DEFAULT_CHAPTER_SUMMARY_CHECKPOINT_PATH = resolve(DEFAULT_OUTLINE_DIR, 'chapter-summaries.json')
export const DEFAULT_OUTLINE_CHECKPOINT_PATH = resolve(DEFAULT_OUTLINE_DIR, 'story-outline.checkpoint.json')
export const DEFAULT_OUTPUT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/story-outline.json')
export const DEFAULT_VOCABULARY_PATH = resolve(PROJECT_ROOT, 'data/2026考研英语词汇闪过.txt')
export const DEFAULT_MODEL = 'gpt-4.1-mini'

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  loadEnvFiles([resolve(PROJECT_ROOT, '.env'), resolve(PROJECT_ROOT, '.env.local')])

  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH
  const chapterCheckpointPath = options.chapterCheckpointPath ?? DEFAULT_CHAPTER_SUMMARY_CHECKPOINT_PATH
  const outlineCheckpointPath = options.outlineCheckpointPath ?? DEFAULT_OUTLINE_CHECKPOINT_PATH
  const vocabularyCount = options.vocabularyCount ?? await readVocabularyCount(options.vocabularyPath ?? DEFAULT_VOCABULARY_PATH)

  if (!existsSync(indexPath)) {
    throw new Error(`novel index not found: ${displayPath(indexPath)}`)
  }

  const index = JSON.parse(await readFile(indexPath, 'utf8'))
  if (!Array.isArray(index.chapters) || index.chapters.length === 0) {
    throw new Error('novel index must contain a non-empty chapters array')
  }

  const llm = createLlmJsonClient({
    apiKey: getFirstEnv(['STORY_LLM_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY']),
    baseURL: getFirstEnv(['STORY_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_BASE_URL']),
    model: getFirstEnv(['STORY_LLM_MODEL', 'OPENAI_MODEL', 'LLM_MODEL']) ?? DEFAULT_MODEL,
  })

  const chapterSummaries = await buildChapterSummaries({
    chapters: index.chapters,
    generateJson: llm.generateJson,
    checkpointPath: chapterCheckpointPath,
  })

  const outline = await buildStoryOutline({
    chapterSummaries,
    vocabularyCount,
    generateJson: llm.generateJson,
    checkpointPath: outlineCheckpointPath,
  })

  await writeJsonAtomic(outputPath, outline)

  console.log(`Chapter summaries: ${chapterSummaries.length}`)
  console.log(`Outline lessons: ${outline.lessons.length}`)
  console.log(`Vocabulary count: ${vocabularyCount}`)
  console.log(`Story outline written: ${displayPath(outputPath)}`)
}

export function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

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
      printHelp()
      process.exit(0)
    }

    throw new Error(`unknown argument: ${arg}`)
  }

  return options
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

export function loadEnvFiles(paths) {
  for (const path of paths) {
    if (!existsSync(path)) {
      continue
    }
    const content = readEnvFileSync(path)
    for (const [key, value] of Object.entries(content)) {
      process.env[key] = value
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

function getFirstEnv(names) {
  for (const name of names) {
    const value = process.env[name]
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

function printHelp() {
  console.log('Usage: node scripts/build-story-outline.mjs [--index PATH] [--output PATH] [--vocabulary-count N]')
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
