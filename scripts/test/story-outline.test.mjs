import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildChapterSummaries,
  buildStoryOutline,
} from '../lib/story-outline.mjs'

function makeChapters(count) {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    title: `第${index + 1}节：事件${index + 1}`,
    characterCount: 2500 + index,
  }))
}

function makeSummaries(count) {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    sourceChapterStart: index + 1,
    sourceChapterEnd: index + 1,
    summary: `摘要${index + 1}`,
    characters: ['方源'],
    events: [`事件${index + 1}`],
  }))
}

function makeLessons(count) {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    sourceChapterStart: index + 1,
    sourceChapterEnd: index + 1,
    plotSummary: `第${index + 1}课主线`,
    characters: ['方源'],
    events: [`事件${index + 1}`],
    continuityStart: index === 0 ? '重生开始' : `承接第${index}课`,
    continuityEnd: index === count - 1 ? '主线阶段收束' : `交给第${index + 2}课`,
    targetWordCapacity: 80,
  }))
}

test('chapter summaries request chapter batches in chronological order', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-order-'))
  const calls = []
  const fakeClient = {
    async generateJson(prompt, schemaName) {
      calls.push({ prompt, schemaName })
      const match = prompt.match(/source chapters (\d+)-(\d+)/i)
      assert.ok(match, `prompt should identify the source range: ${prompt}`)
      return {
        summary: `测试摘要${match[1]}-${match[2]}`,
        characters: ['方源'],
        events: ['重生'],
      }
    },
  }

  try {
    const summaries = await buildChapterSummaries({
      chapters: makeChapters(5),
      generateJson: fakeClient.generateJson.bind(fakeClient),
      checkpointPath: join(tempDir, 'chapter-summaries.json'),
      chapterBatchSize: 2,
    })

    assert.deepEqual(calls.map((call) => call.schemaName), [
      'chapter-summary',
      'chapter-summary',
      'chapter-summary',
    ])
    assert.deepEqual(calls.map((call) => call.prompt.match(/source chapters (\d+)-(\d+)/i).slice(1)), [
      ['1', '2'],
      ['3', '4'],
      ['5', '5'],
    ])
    assert.deepEqual(summaries.map((summary) => [summary.sourceChapterStart, summary.sourceChapterEnd]), [
      [1, 2],
      [3, 4],
      [5, 5],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('chapter summaries load completed batches from checkpoint and resume remaining work', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-resume-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')
  await mkdir(tempDir, { recursive: true })
  await writeFile(checkpointPath, JSON.stringify({
    version: 1,
    chapterBatchSize: 2,
    summaries: [{
      order: 1,
      sourceChapterStart: 1,
      sourceChapterEnd: 2,
      summary: '已有摘要',
      characters: ['方源'],
      events: ['开局'],
    }],
  }, null, 2))

  const calls = []
  const fakeClient = {
    async generateJson(prompt) {
      calls.push(prompt)
      const [, start, end] = prompt.match(/source chapters (\d+)-(\d+)/i)
      return { summary: `新摘要${start}-${end}`, characters: ['方源'], events: ['推进'] }
    },
  }

  try {
    const summaries = await buildChapterSummaries({
      chapters: makeChapters(5),
      generateJson: fakeClient.generateJson.bind(fakeClient),
      checkpointPath,
      chapterBatchSize: 2,
    })

    assert.equal(summaries[0].summary, '已有摘要')
    assert.deepEqual(calls.map((prompt) => prompt.match(/source chapters (\d+)-(\d+)/i).slice(1)), [
      ['3', '4'],
      ['5', '5'],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('story outline validates lesson count, chronology, and word capacity before checkpointing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-final-'))
  const checkpointPath = join(tempDir, 'story-outline.json')
  const fakeClient = {
    calls: [],
    async generateJson(prompt, schemaName) {
      this.calls.push({ prompt, schemaName })
      return { lessons: makeLessons(61) }
    },
  }

  try {
    const outline = await buildStoryOutline({
      chapterSummaries: makeSummaries(61),
      vocabularyCount: 6100,
      generateJson: fakeClient.generateJson.bind(fakeClient),
      checkpointPath,
    })

    assert.equal(outline.lessons.length, 61)
    assert.ok(outline.lessons.every((lesson) => lesson.targetWordCapacity <= 100))
    assert.ok(outline.lessons.every((lesson) => lesson.targetWordCapacity >= 40))
    assert.equal(fakeClient.calls[0].schemaName, 'story-outline')
    assert.match(fakeClient.calls[0].prompt, /chronological/i)
    assert.match(fakeClient.calls[0].prompt, /continuity handoff/i)

    const saved = JSON.parse(await readFile(checkpointPath, 'utf8'))
    assert.equal(saved.lessons.length, 61)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('story outline rejects overlapping or oversized outlines from the JSON client', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-invalid-'))

  try {
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        vocabularyCount: 6100,
        generateJson: async () => ({
          lessons: [
            ...makeLessons(60),
            {
              ...makeLessons(1)[0],
              order: 61,
              sourceChapterStart: 60,
              sourceChapterEnd: 61,
            },
          ],
        }),
        checkpointPath: join(tempDir, 'invalid.json'),
      }),
      /overlap|backward|chronological/i,
    )

    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(151),
        vocabularyCount: 15100,
        generateJson: async () => ({ lessons: makeLessons(151) }),
        checkpointPath: join(tempDir, 'too-many.json'),
      }),
      /61-150|150/,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
