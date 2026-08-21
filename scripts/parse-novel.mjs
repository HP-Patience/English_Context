#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { writeNovelIndex } from './lib/novel-parser.mjs'

const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'scripts/.story-cache/novel-index.json')
const DEFAULT_MAX_REPLACEMENT_DENSITY = 0.001

try {
  const options = parseArgs(process.argv.slice(2))
  const sourcePath = options.sourcePath ?? process.env.NOVEL_SOURCE_PATH ?? defaultSourcePath()
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH
  const maxReplacementDensity = options.maxReplacementDensity ?? DEFAULT_MAX_REPLACEMENT_DENSITY

  if (!existsSync(sourcePath)) {
    throw new Error(`source file not found; expected GB18030 novel source at ${sourcePath}`)
  }

  const result = await writeNovelIndex({
    sourcePath,
    outputPath,
    maxReplacementDensity,
  })

  console.log(`Parsed chapters: ${result.chapterCount}`)
  console.log(`Source bytes: ${result.byteCount}`)
  console.log(`Decoded characters: ${result.characterCount}`)
  console.log(`Cleaned characters: ${result.cleanedCharacterCount}`)
  console.log(`Replacement characters: ${result.replacementCharacterCount} (${result.replacementDensity.toFixed(6)})`)
  console.log(`Index written: ${displayPath(result.outputPath)}`)
} catch (error) {
  console.error(`Failed to parse novel: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--source' || arg === '--source-path') {
      options.sourcePath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--output' || arg === '--output-path') {
      options.outputPath = resolve(requireValue(args, ++index, arg))
      continue
    }

    if (arg === '--max-replacement-density') {
      const rawValue = requireValue(args, ++index, arg)
      const value = Number(rawValue)

      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${arg} must be a non-negative number`)
      }

      options.maxReplacementDensity = value
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

function defaultSourcePath() {
  const candidates = [
    resolve(process.cwd(), '蛊真人.txt'),
    resolve(process.cwd(), '..', '..', '蛊真人.txt'),
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function requireValue(args, index, flag) {
  const value = args[index]

  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }

  return value
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

function printHelp() {
  console.log('Usage: node scripts/parse-novel.mjs [--source PATH] [--output PATH] [--max-replacement-density N]')
}
