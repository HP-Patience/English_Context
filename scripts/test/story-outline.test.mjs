import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildChapterSummaries,
  buildStoryOutline,
  createChapterSummaryPrompt,
  createStoryOutlinePrompt,
} from '../lib/story-outline.mjs'
import { loadEnvFiles, loadSourceChapters, parseArgs } from '../build-story-outline.mjs'

function makeChapters(count, { includeText = false } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    title: `第${index + 1}节：事件${index + 1}`,
    characterCount: 2500 + index,
    ...(includeText ? { text: `第${index + 1}章正文：方源推进事件${index + 1}。` } : {}),
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
    targetWordCapacity: 100,
  }))
}


test('outline prompts explicitly require Simplified Chinese narrative fields', () => {
  const chapterPrompt = createChapterSummaryPrompt({ batch: makeChapters(1, { includeText: true }), batchIndex: 0, batchCount: 1 })
  assert.match(chapterPrompt, /Simplified Chinese|简体中文/)
  assert.match(chapterPrompt, /summary.*characters.*events.*continuityStart.*continuityEnd/s)

  const outlinePrompt = createStoryOutlinePrompt({ chapterSummaries: makeSummaries(61), vocabularyCount: 6100 })
  assert.match(outlinePrompt, /Simplified Chinese|简体中文/)
  assert.match(outlinePrompt, /plotSummary.*characters.*events.*continuityStart.*continuityEnd/s)
})

test('chapter summary generation retries after a transient 5xx LLM error', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-transient-retry-summary-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')
  let calls = 0

  try {
    const summaries = await buildChapterSummaries({
      chapters: makeChapters(1, { includeText: true }),
      generateJson: async () => {
        calls += 1
        if (calls === 1) throw new Error('524 status code (no body)')
        return { summary: '方源回到青茅山并开始谋划。', characters: ['方源'], events: ['试探局势'] }
      },
      checkpointPath,
      chapterBatchSize: 1,
    })

    assert.equal(calls, 2)
    assert.equal(summaries[0].summary, '方源回到青茅山并开始谋划。')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('chapter summary generation strips blank array items before checkpointing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-blank-array-items-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')

  try {
    const summaries = await buildChapterSummaries({
      chapters: makeChapters(1, { includeText: true }),
      generateJson: async () => ({
        summary: '方源设局试探局势。',
        characters: ['方源', '   ', '白凝冰'],
        events: ['试探局势', ''],
      }),
      checkpointPath,
      chapterBatchSize: 1,
    })

    assert.deepEqual(summaries[0].characters, ['方源', '白凝冰'])
    assert.deepEqual(summaries[0].events, ['试探局势'])

    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
    assert.deepEqual(checkpoint.summaries[0].characters, ['方源', '白凝冰'])
    assert.deepEqual(checkpoint.summaries[0].events, ['试探局势'])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('chapter summary generation retries once after a non-Chinese response', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-language-retry-summary-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')
  let calls = 0

  try {
    const summaries = await buildChapterSummaries({
      chapters: makeChapters(1, { includeText: true }),
      generateJson: async () => {
        calls += 1
        if (calls === 1) {
          return {
            summary: 'Fang Yuan returns and begins a ruthless plan.',
            characters: ['Fang Yuan'],
            events: ['He tests the situation.'],
          }
        }
        return { summary: '方源回到青茅山并开始谋划。', characters: ['方源'], events: ['试探局势'] }
      },
      checkpointPath,
      chapterBatchSize: 1,
    })

    assert.equal(calls, 2)
    assert.equal(summaries[0].summary, '方源回到青茅山并开始谋划。')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('English chapter summary responses are rejected before checkpointing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-language-summary-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')

  try {
    await assert.rejects(
      buildChapterSummaries({
        chapters: makeChapters(1, { includeText: true }),
        generateJson: async () => ({
          summary: 'Fang Yuan returns to Qing Mao Mountain and begins a ruthless plan for cultivation.',
          characters: ['Fang Yuan', 'Village elder'],
          events: ['The protagonist tests the situation and hides his intentions.'],
          continuityStart: 'He enters the opening conflict.',
          continuityEnd: 'The next conflict continues from his hidden plan.',
        }),
        checkpointPath,
        chapterBatchSize: 1,
      }),
      /Simplified Chinese|Chinese|中文|language/i,
    )
    assert.equal(existsSync(checkpointPath), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('story outline generation retries once after a non-Chinese lesson response', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-language-retry-final-'))
  const checkpointPath = join(tempDir, 'story-outline.json')
  let calls = 0

  try {
    const outline = await buildStoryOutline({
      chapterSummaries: makeSummaries(61),
      vocabularyCount: 6100,
      generateJson: async () => {
        calls += 1
        if (calls === 1) {
          return { lessons: makeLessons(61).map((lesson, index) => ({
            ...lesson,
            plotSummary: `Lesson ${index + 1} follows Fang Yuan through conflict.`,
            characters: ['Fang Yuan'],
            events: ['He advances the plan.'],
            continuityStart: 'The lesson starts from the previous conflict.',
            continuityEnd: 'The next lesson continues the main line.',
          })) }
        }
        return { lessons: makeLessons(61) }
      },
      checkpointPath,
    })

    assert.equal(calls, 2)
    assert.equal(outline.lessons[0].plotSummary, '第1课主线')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('English story outline lessons are rejected before checkpointing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-language-final-'))
  const checkpointPath = join(tempDir, 'story-outline.json')
  const englishLessons = makeLessons(61).map((lesson, index) => ({
    ...lesson,
    plotSummary: `Lesson ${index + 1} follows Fang Yuan as he advances his plan through conflict.`,
    characters: ['Fang Yuan', 'Clan elder'],
    events: ['He manipulates the situation and prepares the next move.'],
    continuityStart: 'The lesson starts from the previous conflict.',
    continuityEnd: 'The next lesson continues the main line.',
  }))

  try {
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        vocabularyCount: 6100,
        generateJson: async () => ({ lessons: englishLessons }),
        checkpointPath,
      }),
      /Simplified Chinese|Chinese|中文|language/i,
    )
    assert.equal(existsSync(checkpointPath), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

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

test('chapter summaries load completed fingerprint-bound batches and resume remaining work', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-resume-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')
  const chapters = makeChapters(5)
  let interruptedCalls = 0

  try {
    await assert.rejects(
      buildChapterSummaries({
        chapters,
        checkpointPath,
        chapterBatchSize: 2,
        generateJson: async (prompt) => {
          interruptedCalls += 1
          if (interruptedCalls === 2) throw new Error('fixture interruption')
          const [, start, end] = prompt.match(/source chapters (\d+)-(\d+)/i)
          return { summary: `已有摘要${start}-${end}`, characters: ['方源'], events: ['开局'] }
        },
      }),
      /fixture interruption/,
    )

    const calls = []
    const summaries = await buildChapterSummaries({
      chapters,
      checkpointPath,
      chapterBatchSize: 2,
      generateJson: async (prompt) => {
        calls.push(prompt)
        const [, start, end] = prompt.match(/source chapters (\d+)-(\d+)/i)
        return { summary: `新摘要${start}-${end}`, characters: ['方源'], events: ['推进'] }
      },
    })

    assert.equal(summaries[0].summary, '已有摘要1-2')
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

test('chapter summary prompts include transient chapter body text but checkpoints store summaries only', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-body-'))
  const checkpointPath = join(tempDir, 'chapter-summaries.json')
  const bodyPhrase = '方源推进事件1'
  let seenPrompt = ''

  try {
    await buildChapterSummaries({
      chapters: makeChapters(2, { includeText: true }),
      generateJson: async (prompt) => {
        seenPrompt = prompt
        return { summary: '根据情节生成的摘要', characters: ['方源'], events: ['推进'] }
      },
      checkpointPath,
      chapterBatchSize: 2,
    })

    assert.match(seenPrompt, new RegExp(bodyPhrase))
    const checkpointText = await readFile(checkpointPath, 'utf8')
    assert.doesNotMatch(checkpointText, new RegExp(bodyPhrase))
    assert.doesNotMatch(checkpointText, /正文/)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('CLI source loader reparses GB18030 raw novel and attaches chapter bodies to index metadata', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/novel-sample-gb18030.bin', import.meta.url))
  const chapters = await loadSourceChapters({
    sourcePath: fixturePath,
    indexChapters: [
      { order: 1, title: '第一章 初入青茅山', characterCount: 0 },
      { order: 2, title: '第二章 魔头重生', characterCount: 0 },
    ],
  })

  assert.equal(chapters[0].text, '甲醒来。')
  assert.equal(chapters[1].text, '乙离开。')
})

test('malformed LLM summary responses and checkpoints are rejected without placeholder defaults', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-malformed-'))
  const badResponseCheckpoint = join(tempDir, 'bad-response.json')
  const malformedCheckpoint = join(tempDir, 'malformed-checkpoint.json')

  try {
    await assert.rejects(
      buildChapterSummaries({
        chapters: makeChapters(1, { includeText: true }),
        generateJson: async () => ({ summary: '缺少角色和事件' }),
        checkpointPath: badResponseCheckpoint,
        chapterBatchSize: 1,
      }),
      /invalid chapter-summary response|characters|events/,
    )
    assert.equal(existsSync(badResponseCheckpoint), false)

    const chapters = makeChapters(1, { includeText: true })
    await buildChapterSummaries({
      chapters,
      generateJson: async () => ({ summary: '有效摘要', characters: ['方源'], events: ['事件'] }),
      checkpointPath: malformedCheckpoint,
      chapterBatchSize: 1,
    })
    const malformedSummary = JSON.parse(await readFile(malformedCheckpoint, 'utf8'))
    delete malformedSummary.summaries[0].summary
    await writeFile(malformedCheckpoint, JSON.stringify(malformedSummary))

    await assert.rejects(
      buildChapterSummaries({
        chapters,
        generateJson: async () => ({ summary: '不会调用', characters: ['方源'], events: ['事件'] }),
        checkpointPath: malformedCheckpoint,
        chapterBatchSize: 1,
      }),
      /invalid chapter summary|summary must be a non-empty string/,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('malformed outline responses and checkpoints are rejected without deterministic fallback', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-malformed-final-'))
  const badResponseCheckpoint = join(tempDir, 'bad-outline-response.json')
  const malformedCheckpoint = join(tempDir, 'malformed-outline-checkpoint.json')

  try {
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        vocabularyCount: 6100,
        generateJson: async () => ({ lessons: makeLessons(61).map((lesson, index) => (index === 0 ? { ...lesson, continuityStart: '' } : lesson)) }),
        checkpointPath: badResponseCheckpoint,
      }),
      /continuityStart must be a non-empty string/,
    )
    assert.equal(existsSync(badResponseCheckpoint), false)

    const chapterSummaries = makeSummaries(61)
    await buildStoryOutline({
      chapterSummaries,
      vocabularyCount: 6100,
      generateJson: async () => ({ lessons: makeLessons(61) }),
      checkpointPath: malformedCheckpoint,
    })
    const malformedOutline = JSON.parse(await readFile(malformedCheckpoint, 'utf8'))
    delete malformedOutline.lessons[0].plotSummary
    await writeFile(malformedCheckpoint, JSON.stringify(malformedOutline))
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries,
        vocabularyCount: 6100,
        generateJson: async () => ({ lessons: makeLessons(61) }),
        checkpointPath: malformedCheckpoint,
      }),
      /plotSummary must be a non-empty string/,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('story outline source span must exactly match available first and last chapters', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-span-'))

  try {
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        vocabularyCount: 6100,
        generateJson: async () => ({
          lessons: makeLessons(61).map((lesson, index) => (
            index === 0 ? { ...lesson, sourceChapterStart: 0, sourceChapterEnd: 1 } : lesson
          )),
        }),
        checkpointPath: join(tempDir, 'before.json'),
      }),
      /exact first source chapter|outside available source span/,
    )

    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        vocabularyCount: 6100,
        generateJson: async () => ({
          lessons: makeLessons(61).map((lesson, index) => (
            index === 60 ? { ...lesson, sourceChapterEnd: 62 } : lesson
          )),
        }),
        checkpointPath: join(tempDir, 'after.json'),
      }),
      /exact last source chapter|outside available source span/,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('exported environment values win over env files and source flag is parsed', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-outline-env-'))
  const envPath = join(tempDir, '.env')
  const envLocalPath = join(tempDir, '.env.local')
  const targetEnv = {
    STORY_LLM_MODEL: 'shell-model',
  }

  try {
    await writeFile(envPath, 'STORY_LLM_MODEL=file-model\nSTORY_LLM_BASE_URL=https://env.example\n')
    await writeFile(envLocalPath, 'STORY_LLM_MODEL=local-model\nSTORY_LLM_BASE_URL=https://local.example\n')
    loadEnvFiles([envPath, envLocalPath], targetEnv)

    assert.equal(targetEnv.STORY_LLM_MODEL, 'shell-model')
    assert.equal(targetEnv.STORY_LLM_BASE_URL, 'https://local.example')

    const parsed = parseArgs(['--source', 'raw.txt', '--vocabulary-count', '61'])
    assert.equal(parsed.sourcePath.endsWith('raw.txt'), true)
    assert.equal(parsed.vocabularyCount, 61)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
