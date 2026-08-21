import { fingerprintBytes, fingerprintValue } from './input-fingerprint.mjs'

const DEFAULT_MAX_REPLACEMENT_DENSITY = 0.001

const CHINESE_DIGITS = new Map([
  ['零', 0],
  ['〇', 0],
  ['○', 0],
  ['一', 1],
  ['二', 2],
  ['两', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['七', 7],
  ['八', 8],
  ['九', 9],
])

const CHINESE_UNITS = new Map([
  ['十', 10],
  ['百', 100],
  ['千', 1000],
  ['万', 10000],
  ['亿', 100000000],
])

const BOILERPLATE_LINE_PATTERNS = [
  /爱下电子书/,
  /本书来自/,
  /电子书(?:下载|论坛|txt)?/i,
  /(?:txt|epub|mobi).*下载/i,
  /(?:http|https):\/\//i,
  /www\./i,
  /最新网址/,
  /请牢记/,
  /手机阅读/,
  /无弹窗/,
  /全文阅读/,
  /章节目录/,
  /更多(?:精彩)?小说/,
]

const CHAPTER_HEADING_PATTERN = /^[ \t　]*(第([0-9０-９零〇○一二两三四五六七八九十百千万亿]+)[ \t　]*[章节回篇][^\n]{0,80})[ \t　]*$/u
const CHAPTER_HEADING_SCAN = /(^|\n)[ \t　]*(第([0-9０-９零〇○一二两三四五六七八九十百千万亿]+)[ \t　]*[章节回篇][^\n]{0,80})[ \t　]*(?=\n|$)/gu

/**
 * Decode a GB18030 source buffer into Unicode text.
 *
 * @param {Buffer | Uint8Array | ArrayBuffer} buffer
 * @returns {string}
 */
export function decodeNovelBuffer(buffer) {
  return new TextDecoder('gb18030').decode(buffer)
}

/**
 * Normalize novel text and strip source-site boilerplate lines.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanNovelText(text) {
  if (typeof text !== 'string') {
    throw new TypeError('cleanNovelText expects a string')
  }

  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060]/g, '')

  const cleanedLines = normalized
    .split('\n')
    .map((line) => line.replace(/[ \t　]+$/u, ''))
    .filter((line) => !isBoilerplateLine(line))

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Parse chapter ranges from cleaned novel text.
 *
 * @param {string} text
 * @returns {Array<{ order: number, title: string, text: string, startOffset: number, endOffset: number }>}
 */
export function parseChapters(text) {
  return parseChaptersWithDiagnostics(text).chapters
}

export function parseChaptersWithDiagnostics(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseChapters expects a string')
  }

  const headings = findChapterHeadings(text)
  const numberingGaps = []
  const repairedOrders = []
  let previousOrder = 0
  let previousParsedOrder = null

  const chapters = headings.map((heading, index) => {
    const nextHeading = headings[index + 1]
    const endOffset = nextHeading?.startOffset ?? text.length
    const parsedOrder = parseChapterNumber(heading.numberText)
    const order = Number.isInteger(parsedOrder) && parsedOrder > previousOrder
      ? parsedOrder
      : previousOrder + 1

    if (Number.isInteger(parsedOrder) && previousParsedOrder !== null && parsedOrder > previousParsedOrder + 1) {
      numberingGaps.push({
        headingIndex: index + 1,
        afterSourceOrder: previousParsedOrder,
        beforeSourceOrder: parsedOrder,
        missingStart: previousParsedOrder + 1,
        missingEnd: parsedOrder - 1,
      })
    }
    if (!Number.isInteger(parsedOrder) || parsedOrder <= previousOrder) {
      repairedOrders.push({
        headingIndex: index + 1,
        parsedOrder: Number.isInteger(parsedOrder) ? parsedOrder : null,
        assignedOrder: order,
        reason: Number.isInteger(parsedOrder) ? 'non_monotonic' : 'unparseable',
        title: normalizeChapterTitle(heading.title),
      })
    }

    if (Number.isInteger(parsedOrder)) previousParsedOrder = parsedOrder
    previousOrder = order

    return {
      order,
      sourceOrder: Number.isInteger(parsedOrder) ? parsedOrder : null,
      orderRepaired: order !== parsedOrder,
      title: normalizeChapterTitle(heading.title),
      text: text.slice(heading.contentStartOffset, endOffset).trim(),
      startOffset: heading.startOffset,
      endOffset,
    }
  })

  return {
    chapters,
    diagnostics: {
      numberingGapCount: numberingGaps.length,
      repairedOrderCount: repairedOrders.length,
      numberingGaps,
      repairedOrders,
    },
  }
}

/**
 * Decode a source novel, parse chapters, and write an offline chapter index.
 * The generated index intentionally omits chapter body text.
 *
 * @param {{ sourcePath: string | URL, outputPath: string | URL, maxReplacementDensity?: number }} options
 * @returns {Promise<{ chapterCount: number, outputPath: string, byteCount: number, characterCount: number, cleanedCharacterCount: number, replacementCharacterCount: number, replacementDensity: number }>}
 */
export async function writeNovelIndex({
  sourcePath,
  outputPath,
  maxReplacementDensity = DEFAULT_MAX_REPLACEMENT_DENSITY,
}) {
  const { mkdir, readFile, writeFile } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  if (!sourcePath) {
    throw new TypeError('writeNovelIndex requires sourcePath')
  }

  if (!outputPath) {
    throw new TypeError('writeNovelIndex requires outputPath')
  }

  const bytes = await readFile(sourcePath)
  const decodedText = decodeNovelBuffer(bytes)
  const replacementCharacterCount = countReplacementCharacters(decodedText)
  const replacementDensity = decodedText.length === 0 ? 0 : replacementCharacterCount / decodedText.length

  if (replacementDensity > maxReplacementDensity) {
    throw new Error(
      `decoded replacement-character density ${formatDensity(replacementDensity)} exceeds limit ${formatDensity(maxReplacementDensity)}`,
    )
  }

  const cleanedText = cleanNovelText(decodedText)
  const { chapters, diagnostics } = parseChaptersWithDiagnostics(cleanedText)
  const sourceFingerprint = fingerprintBytes(bytes)

  if (chapters.length === 0) {
    throw new Error('no chapter headings found in decoded novel text')
  }

  const outputFilePath = pathLikeToString(outputPath, fileURLToPath)
  const index = {
    generatedAt: new Date().toISOString(),
    sourceEncoding: 'gb18030',
    byteCount: bytes.length,
    characterCount: decodedText.length,
    cleanedCharacterCount: cleanedText.length,
    replacementCharacterCount,
    replacementDensity,
    sourceFingerprint,
    chapterCount: chapters.length,
    diagnostics,
    chapters: chapters.map((chapter) => ({
      order: chapter.order,
      sourceOrder: chapter.sourceOrder,
      orderRepaired: chapter.orderRepaired,
      title: chapter.title,
      startOffset: chapter.startOffset,
      endOffset: chapter.endOffset,
      characterCount: chapter.text.length,
    })),
  }
  index.chapterIndexFingerprint = fingerprintValue(index.chapters)

  await mkdir(dirname(outputFilePath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  return {
    chapterCount: chapters.length,
    outputPath: outputFilePath,
    byteCount: bytes.length,
    characterCount: decodedText.length,
    cleanedCharacterCount: cleanedText.length,
    replacementCharacterCount,
    replacementDensity,
    sourceFingerprint,
    chapterIndexFingerprint: index.chapterIndexFingerprint,
    diagnostics,
  }
}

function findChapterHeadings(text) {
  CHAPTER_HEADING_SCAN.lastIndex = 0
  const headings = []

  for (const match of text.matchAll(CHAPTER_HEADING_SCAN)) {
    const prefix = match[1] ?? ''
    const rawTitle = match[2]
    const numberText = match[3]
    const startOffset = match.index + prefix.length + leadingWhitespaceLength(match[0].slice(prefix.length))
    const title = rawTitle.trim()
    const titleEndOffset = startOffset + rawTitle.length
    const contentStartOffset = text[titleEndOffset] === '\n' ? titleEndOffset + 1 : titleEndOffset

    if (!CHAPTER_HEADING_PATTERN.test(title)) {
      continue
    }

    headings.push({
      numberText,
      title,
      startOffset,
      contentStartOffset,
    })
  }

  return headings
}

function isBoilerplateLine(line) {
  const trimmed = line.trim()

  if (trimmed.length === 0) {
    return false
  }

  if (trimmed.length > 180) {
    return false
  }

  return BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function leadingWhitespaceLength(value) {
  const match = value.match(/^[ \t　]*/u)
  return match?.[0].length ?? 0
}

function normalizeChapterTitle(title) {
  return title.replace(/[ \t　]+/gu, ' ').trim()
}

function parseChapterNumber(value) {
  const normalized = normalizeAsciiDigits(value)

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10)
  }

  let total = 0
  let section = 0
  let digit = 0
  let sawKnownToken = false

  for (const char of normalized) {
    if (CHINESE_DIGITS.has(char)) {
      digit = CHINESE_DIGITS.get(char)
      sawKnownToken = true
      continue
    }

    if (!CHINESE_UNITS.has(char)) {
      return null
    }

    sawKnownToken = true
    const unit = CHINESE_UNITS.get(char)

    if (unit >= 10000) {
      section = (section + digit) || 1
      total += section * unit
      section = 0
      digit = 0
      continue
    }

    section += (digit || 1) * unit
    digit = 0
  }

  if (!sawKnownToken) {
    return null
  }

  return total + section + digit
}

function normalizeAsciiDigits(value) {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
}

function countReplacementCharacters(value) {
  let count = 0

  for (const char of value) {
    if (char === '�') {
      count += 1
    }
  }

  return count
}

function pathLikeToString(pathLike, fileURLToPath) {
  return pathLike instanceof URL ? fileURLToPath(pathLike) : String(pathLike)
}

function formatDensity(value) {
  return value.toFixed(6)
}
