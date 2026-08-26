#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeNovelIndex } from './lib/novel-parser.mjs'

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DEFAULT_SOURCE_PATH = resolve(PROJECT_ROOT, 'data/local/story/蛊真人.txt')
export const DEFAULT_OUTPUT_PATH = resolve(PROJECT_ROOT, 'scripts/.story-cache/novel-index.json')
export const DEFAULT_MAX_REPLACEMENT_DENSITY = 0.001

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args)
  const log = dependencies.log ?? console.log
  if (options.help) {
    log(helpText())
    return { help: true }
  }

  const sourcePath = options.sourcePath ?? DEFAULT_SOURCE_PATH
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH
  const maxReplacementDensity = options.maxReplacementDensity ?? DEFAULT_MAX_REPLACEMENT_DENSITY
  const fileExists = dependencies.existsSync ?? existsSync

  if (!fileExists(sourcePath)) {
    throw new Error(`source file not found; expected GB18030 novel source at ${sourcePath}`)
  }

  const result = await (dependencies.writeNovelIndex ?? writeNovelIndex)({
    sourcePath,
    outputPath,
    maxReplacementDensity,
  })

  log(`Parsed chapters: ${result.chapterCount}`)
  log(`Source bytes: ${result.byteCount}`)
  log(`Decoded characters: ${result.characterCount}`)
  log(`Cleaned characters: ${result.cleanedCharacterCount}`)
  log(`Replacement characters: ${result.replacementCharacterCount} (${result.replacementDensity.toFixed(6)})`)
  log(`Chapter numbering gaps: ${result.diagnostics?.numberingGapCount ?? 0}`)
  log(`Repaired/non-monotonic chapter orders: ${result.diagnostics?.repairedOrderCount ?? 0}`)
  for (const gap of result.diagnostics?.numberingGaps ?? []) {
    log(`  Gap after source chapter ${gap.afterSourceOrder}: missing ${gap.missingStart}-${gap.missingEnd} before ${gap.beforeSourceOrder}`)
  }
  for (const repair of result.diagnostics?.repairedOrders ?? []) {
    log(`  Repaired heading ${repair.headingIndex}: parsed ${repair.parsedOrder ?? 'unparseable'} -> assigned ${repair.assignedOrder} (${repair.reason})`)
  }
  log(`Index written: ${displayPath(result.outputPath)}`)
  return result
}

export function parseArgs(args) {
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
      if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be a non-negative number`)
      options.maxReplacementDensity = value
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

function requireValue(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function displayPath(path) {
  const relativePath = relative(PROJECT_ROOT, path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

export function helpText() {
  return `Usage: node scripts/parse-novel.mjs [options]

Options:
  --source, --source-path PATH          GB18030 raw novel source (default: ${DEFAULT_SOURCE_PATH})
  --output, --output-path PATH          Metadata-only chapter index (default: scripts/.story-cache/novel-index.json)
  --max-replacement-density N           Maximum decoded replacement-character ratio (default: ${DEFAULT_MAX_REPLACEMENT_DENSITY})
  -h, --help                            Show this help`
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  try {
    await main()
  } catch (error) {
    console.error(`Failed to parse novel: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
