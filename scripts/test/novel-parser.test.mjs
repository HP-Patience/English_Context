import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeNovelBuffer, cleanNovelText, parseChapters, writeNovelIndex } from '../lib/novel-parser.mjs'

test('decodes GB18030 Chinese text', async () => {
  const bytes = await readFile(new URL('./fixtures/novel-sample-gb18030.bin', import.meta.url))
  assert.match(decodeNovelBuffer(bytes), /蛊真人/)
})

test('parses ordered chapters and removes source boilerplate', () => {
  const chapters = parseChapters(cleanNovelText('第一章\n甲\n第二章\n乙\n爱下电子书'))
  assert.deepEqual(chapters.map((chapter) => chapter.order), [1, 2])
  assert.equal(chapters.some((chapter) => chapter.text.includes('爱下电子书')), false)
})

test('preserves chapter offsets and flexible titles', () => {
  const text = cleanNovelText('蛊真人\r\n第十章 风起青茅山\r\n甲\r\n\r\n第十一章\t旧梦\r\n乙')
  const chapters = parseChapters(text)

  assert.deepEqual(chapters.map((chapter) => chapter.order), [10, 11])
  assert.equal(text.slice(chapters[0].startOffset, chapters[0].endOffset).startsWith('第十章 风起青茅山'), true)
  assert.equal(chapters[0].endOffset, chapters[1].startOffset)
  assert.equal(chapters[1].title, '第十一章 旧梦')
})

test('writes a non-text chapter index without raw chapter bodies', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'novel-parser-'))
  const sourcePath = new URL('./fixtures/novel-sample-gb18030.bin', import.meta.url)
  const outputPath = join(tempDir, 'novel-index.json')

  try {
    const result = await writeNovelIndex({ sourcePath, outputPath })
    assert.equal(result.chapterCount, 2)
    assert.equal(result.outputPath, outputPath)

    const index = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(index.chapterCount, 2)
    assert.equal(index.replacementCharacterCount, 0)
    assert.deepEqual(index.chapters.map((chapter) => chapter.order), [1, 2])
    assert.equal(index.chapters.some((chapter) => 'text' in chapter), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
