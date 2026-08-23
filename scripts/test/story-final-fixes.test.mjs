import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createLlmJsonClient } from '../lib/llm-json.mjs'
import { fingerprintValue } from '../lib/input-fingerprint.mjs'
import { buildChapterSummaries, buildStoryOutline, validateStoryOutline } from '../lib/story-outline.mjs'
import { main as generateLessonsCommand, parseArgs as parseGenerateArgs } from '../generate-story-lessons.mjs'
import { generateLessonsFromAssignments, validateCorpus } from '../lib/story-lesson-generator.mjs'
import {
  ARCHIVED_COURSE_STATUS,
  DRAFT_COURSE_STATUS,
  READY_COURSE_SLOT,
  READY_COURSE_STATUS,
  createOrResumeDraftCourse,
  findReadyCourse,
  persistDraftLesson,
  publishDraftCourse,
} from '../lib/story-lesson-repository.mjs'

function makeOutlineLessons(count, capacity = 100) {
  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    sourceChapterStart: index + 1,
    sourceChapterEnd: index + 1,
    plotSummary: `第${index + 1}课主线推进`,
    characters: ['方源'],
    events: [`事件${index + 1}`],
    continuityStart: `承接第${index + 1}课开始状态`,
    continuityEnd: `交给第${index + 1}课结束状态`,
    targetWordCapacity: capacity,
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

function makeLesson({ order, start, end, word, gloss = `释义-${word}`, phonetic = '/ˈælfə/', continuityNotes = `交接-${order}` }) {
  return {
    title: `第${order}课故事`,
    order,
    sourceChapterStart: String(start),
    sourceChapterEnd: String(end),
    sourceSummary: `摘要-${order}`,
    continuityNotes,
    paragraphs: [{
      sceneTitle: `场景-${order}`,
      segments: [
        { type: 'text', value: '上下文' },
        { type: 'targetWord', word, definitionCn: gloss, phonetic, wordOrder: 1 },
      ],
    }],
  }
}

test('fingerprints are stable for key order and change with input', () => {
  assert.equal(fingerprintValue({ b: 2, a: 1 }), fingerprintValue({ a: 1, b: 2 }))
  assert.notEqual(fingerprintValue({ a: 1 }), fingerprintValue({ a: 2 }))
})

test('OpenAI-compatible adapter prefers chat completions and supports explicit Responses transport', async () => {
  const calls = []
  const client = {
    chat: { completions: { create: async () => {
      calls.push('chat')
      return { choices: [{ message: { content: '{"transport":"chat"}' } }] }
    } } },
    responses: { create: async () => {
      calls.push('responses')
      return { output_text: '{"transport":"responses"}' }
    } },
  }

  const automatic = createLlmJsonClient({ client, model: 'fixture-model' })
  assert.deepEqual(await automatic.generateJson('prompt'), { transport: 'chat' })
  assert.deepEqual(calls, ['chat'])

  const responses = createLlmJsonClient({ client, model: 'fixture-model', transport: 'responses' })
  assert.deepEqual(await responses.generateJson('prompt'), { transport: 'responses' })
})

test('OpenAI-compatible adapter retries transient transport errors', async () => {
  let calls = 0
  const client = {
    chat: {
      completions: {
        create: async () => {
          calls += 1
          if (calls === 1) {
            const error = new Error('524 status code (no body)')
            error.status = 524
            throw error
          }
          return { choices: [{ message: { content: '{"ok":true}' } }] }
        },
      },
    },
  }

  const adapter = createLlmJsonClient({ client, model: 'fixture-model', retryAttempts: 2, retryDelayMs: 0 })
  assert.deepEqual(await adapter.generateJson('prompt'), { ok: true })
  assert.equal(calls, 2)
})

test('story generation sample mode writes selected checkpoint without mutating course tables', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-sample-generation-'))
  const indexPath = join(tempDir, 'novel-index.json')
  const outlinePath = join(tempDir, 'story-outline.json')
  const checkpointDir = join(tempDir, 'lessons')
  const reportPath = join(tempDir, 'report.json')
  const progressPath = join(tempDir, 'progress.json')
  const sourceFingerprint = 'sample-source'
  const summaryFingerprint = 'sample-summary'
  const chapters = Array.from({ length: 61 }, (_, index) => ({
    order: index + 1,
    sourceOrder: index + 1,
    title: `第${index + 1}章`,
    startOffset: index * 10,
    endOffset: index * 10 + 10,
  }))
  const outline = {
    version: 2,
    sourceFingerprint,
    summaryFingerprint,
    vocabularyCount: 2,
    inputFingerprint: fingerprintValue({ sourceFingerprint, summaryFingerprint, vocabularyCount: 2 }),
    lessons: Array.from({ length: 61 }, (_, index) => ({
      order: index + 1,
      sourceChapterStart: index + 1,
      sourceChapterEnd: index + 1,
      plotSummary: index === 0 ? '方源在青茅山醒来，冷静确认自己重回少年时代。' : `方源在第${index + 1}章继续观察局势。`,
      characters: ['方源'],
      events: [index === 0 ? '方源重生' : `第${index + 1}章事件`],
      continuityStart: index === 0 ? '故事从青茅山开始。' : `承接第${index}章。`,
      continuityEnd: `进入第${index + 2}章前的局势。`,
      targetWordCapacity: 100,
    })),
  }
  const index = {
    sourceFingerprint,
    chapterIndexFingerprint: fingerprintValue(chapters),
    chapters,
  }
  const wordGroups = [{
    id: 'group-1',
    sortOrder: 1,
    words: [
      { sortOrder: 1, word: { id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/', meanings: [{ id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '阿尔法' }] } },
      { sortOrder: 2, word: { id: 'word-beta', text: 'beta', phonetic: '/ˈbeɪtə/', meanings: [{ id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }] } },
    ],
  }]
  let draftCalls = 0
  let persistCalls = 0

  try {
    const report = await generateLessonsCommand([
      '--index', indexPath,
      '--outline', outlinePath,
      '--checkpoint-dir', checkpointDir,
      '--report', reportPath,
      '--progress', progressPath,
      '--expected-word-count', '2',
      '--sample',
      '--from', '1',
      '--to', '1',
    ], {
      log: () => {},
      loadEnvironment: false,
      env: {},
      prisma: { wordGroup: { findMany: async () => wordGroups } },
      readJson: async (path) => path === indexPath ? index : outline,
      existsSync: () => true,
      createOrResumeDraftCourse: async () => { draftCalls += 1; throw new Error('sample mode must not create a draft course') },
      persistDraftLesson: async () => { persistCalls += 1; throw new Error('sample mode must not persist lessons') },
      generateJson: async () => ({
        title: '第1课故事',
        order: 1,
        sourceChapterStart: '1',
        sourceChapterEnd: '1',
        sourceSummary: '方源在青茅山醒来，冷静确认自己重回少年时代。',
        continuityNotes: '方源确认处境，准备重新布局。',
        paragraphs: [{
          sceneTitle: '青茅山的清晨',
          segments: [
            { type: 'text', value: '方源睁开眼时，窗外的山雾正压在古月山寨的屋檐上。' },
            { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', phonetic: '/ˈælfə/', wordOrder: 1 },
            { type: 'text', value: '这个念头像冷水一样落下，他没有惊叫，只把五百年的记忆重新按进心底。' },
            { type: 'targetWord', word: 'beta', definitionCn: '贝塔', phonetic: '/ˈbeɪtə/', wordOrder: 2 },
          ],
        }],
      }),
    })

    assert.equal(draftCalls, 0)
    assert.equal(persistCalls, 0)
    assert.equal(report.courseStatus, 'sample')
    assert.deepEqual(report.lessonRange, { from: 1, to: 1 })
    assert.equal(report.selectedLessonCount, 1)
    assert.equal(report.generatedLessonCount, 1)
    const checkpoint = JSON.parse(await readFile(join(checkpointDir, 'sample-1-1', 'lesson-0001.json'), 'utf8'))
    assert.equal(checkpoint.lesson.order, 1)
    assert.equal(existsSync(join(checkpointDir, 'sample-1-1', 'lesson-0002.json')), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('story generation range flags are parsed for sample runs', () => {
  assert.deepEqual(parseGenerateArgs(['--sample', '--from', '2', '--to', '4']), { sample: true, fromOrder: 2, toOrder: 4 })
  assert.deepEqual(parseGenerateArgs(['--pre-lessons-only', '--pre-lessons-dir', 'preview', '--from', '2', '--to', '4']), { preLessonsOnly: true, preLessonsDir: join(process.cwd(), 'preview'), fromOrder: 2, toOrder: 4 })
  assert.throws(() => parseGenerateArgs(['--from', '0']), /positive integer/)
})


test('pre-lessons-only writes AI input preview JSON without calling LLM or mutating course tables', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-pre-lessons-'))
  const indexPath = join(tempDir, 'novel-index.json')
  const outlinePath = join(tempDir, 'story-outline.json')
  const checkpointDir = join(tempDir, 'lessons')
  const preLessonsDir = join(checkpointDir, 'pre_lessons')
  const reportPath = join(tempDir, 'report.json')
  const progressPath = join(tempDir, 'progress.json')
  const sourceFingerprint = 'pre-source'
  const summaryFingerprint = 'pre-summary'
  const chapters = Array.from({ length: 61 }, (_, index) => ({
    order: index + 1,
    sourceOrder: index + 1,
    title: `第${index + 1}章`,
    startOffset: index * 10,
    endOffset: index * 10 + 10,
    characterCount: 10,
  }))
  const outline = {
    version: 2,
    sourceFingerprint,
    summaryFingerprint,
    vocabularyCount: 2,
    inputFingerprint: fingerprintValue({ sourceFingerprint, summaryFingerprint, vocabularyCount: 2 }),
    lessons: Array.from({ length: 61 }, (_, index) => ({
      order: index + 1,
      sourceChapterStart: index + 1,
      sourceChapterEnd: index + 1,
      plotSummary: index === 0 ? '方源在青茅山醒来，确认自己重回少年时代。' : `方源在第${index + 1}章继续观察局势。`,
      characters: ['方源'],
      events: [index === 0 ? '方源重生' : `第${index + 1}章事件`],
      continuityStart: index === 0 ? '故事从青茅山开始。' : `承接第${index}章。`,
      continuityEnd: `进入第${index + 2}章前的局势。`,
      targetWordCapacity: 100,
    })),
  }
  const novelIndex = { sourceFingerprint, chapterIndexFingerprint: fingerprintValue(chapters), chapters }
  const wordGroups = [{
    id: 'group-1',
    sortOrder: 1,
    words: [
      { sortOrder: 1, word: { id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/', meanings: [{ id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '阿尔法' }] } },
      { sortOrder: 2, word: { id: 'word-beta', text: 'beta', phonetic: '/ˈbeɪtə/', meanings: [{ id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }] } },
    ],
  }]
  let draftCalls = 0
  let llmCalls = 0
  let persistCalls = 0

  try {
    const report = await generateLessonsCommand([
      '--index', indexPath,
      '--outline', outlinePath,
      '--checkpoint-dir', checkpointDir,
      '--pre-lessons-dir', preLessonsDir,
      '--report', reportPath,
      '--progress', progressPath,
      '--expected-word-count', '2',
      '--pre-lessons-only',
      '--from', '1',
      '--to', '1',
    ], {
      log: () => {},
      loadEnvironment: false,
      env: {},
      prisma: { wordGroup: { findMany: async () => wordGroups } },
      readJson: async (path) => path === indexPath ? novelIndex : outline,
      existsSync: () => true,
      createOrResumeDraftCourse: async () => { draftCalls += 1; throw new Error('pre-lessons-only must not create a draft course') },
      generateJson: async () => { llmCalls += 1; throw new Error('pre-lessons-only must not call LLM') },
      persistDraftLesson: async () => { persistCalls += 1; throw new Error('pre-lessons-only must not persist lessons') },
    })

    assert.equal(draftCalls, 0)
    assert.equal(llmCalls, 0)
    assert.equal(persistCalls, 0)
    assert.equal(report.courseStatus, 'pre_lessons')
    assert.equal(report.preLessonCount, 1)
    assert.equal(report.generatedLessonCount, 0)
    const preLesson = JSON.parse(await readFile(join(preLessonsDir, 'lesson-0001.json'), 'utf8'))
    assert.equal(preLesson.kind, 'story-lesson-ai-input-preview')
    assert.equal(preLesson.lessonOrder, 1)
    assert.equal(preLesson.targetWordCount, 2)
    assert.deepEqual(preLesson.targetWords.map((word) => [word.text, word.definitionCn]), [['alpha', '阿尔法'], ['beta', '贝塔']])
    assert.equal(preLesson.sourceChapterRange.chapters[0].title, '第1章')
    assert.match(preLesson.llmPromptPreview, /Target words and contextual Chinese glosses JSON/)
    assert.match(preLesson.llmPromptPreview, /alpha/)
    const manifest = JSON.parse(await readFile(join(preLessonsDir, 'manifest.json'), 'utf8'))
    assert.equal(manifest.lessonCount, 1)
    assert.equal(manifest.totalTargetWords, 2)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})


test('from-pre-lessons reads preview prompt and writes generated lesson JSON files only', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-from-pre-lessons-'))
  const indexPath = join(tempDir, 'novel-index.json')
  const outlinePath = join(tempDir, 'story-outline.json')
  const checkpointDir = join(tempDir, 'lessons')
  const preLessonsDir = join(checkpointDir, 'pre_lessons')
  const reportPath = join(tempDir, 'report.json')
  const progressPath = join(tempDir, 'progress.json')
  const sourceFingerprint = 'from-pre-source'
  const summaryFingerprint = 'from-pre-summary'
  const chapters = Array.from({ length: 61 }, (_, index) => ({ order: index + 1, sourceOrder: index + 1, title: `第${index + 1}章`, startOffset: index * 10, endOffset: index * 10 + 10 }))
  const outline = {
    version: 2,
    sourceFingerprint,
    summaryFingerprint,
    vocabularyCount: 1,
    inputFingerprint: fingerprintValue({ sourceFingerprint, summaryFingerprint, vocabularyCount: 1 }),
    lessons: Array.from({ length: 61 }, (_, index) => ({
      order: index + 1,
      sourceChapterStart: index + 1,
      sourceChapterEnd: index + 1,
      plotSummary: index === 0 ? '方源醒来后确认自己回到青茅山。' : `方源继续处理第${index + 1}章的局势。`,
      characters: ['方源'],
      events: [index === 0 ? '方源重生' : `第${index + 1}章事件`],
      continuityStart: index === 0 ? '青茅山清晨。' : `承接第${index}章。`,
      continuityEnd: `第${index + 1}章结束。`,
      targetWordCapacity: 100,
    })),
  }
  const novelIndex = { sourceFingerprint, chapterIndexFingerprint: fingerprintValue(chapters), chapters }

  try {
    await mkdir(preLessonsDir, { recursive: true })
    await writeFile(join(preLessonsDir, 'lesson-0001.json'), `${JSON.stringify({
      version: 1,
      kind: 'story-lesson-ai-input-preview',
      lessonOrder: 1,
      outlineLesson: outline.lessons[0],
      previousLessonPreview: null,
      nextLessonPreview: { continuityStart: '下一课开始。' },
      targetWordCount: 1,
      targetWords: [{ order: 1, id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/', meaningId: 'meaning-alpha', definitionCn: '阿尔法', groupSortOrder: 1, itemSortOrder: 1 }],
      llmPromptPreview: 'PREVIEW PROMPT alpha 阿尔法',
    }, null, 2)}
`, 'utf8')
    let receivedPrompt = ''
    let dbTouched = false
    const report = await generateLessonsCommand([
      '--index', indexPath,
      '--outline', outlinePath,
      '--checkpoint-dir', checkpointDir,
      '--pre-lessons-dir', preLessonsDir,
      '--report', reportPath,
      '--progress', progressPath,
      '--from-pre-lessons',
      '--from', '1',
      '--to', '1',
    ], {
      log: () => {},
      loadEnvironment: false,
      env: {},
      prisma: { wordGroup: { findMany: async () => { dbTouched = true; throw new Error('from-pre-lessons must not read vocabulary database') } } },
      readJson: async (path) => path === indexPath ? novelIndex : outline,
      existsSync: () => true,
      generateJson: async (prompt, schemaName) => {
        receivedPrompt = prompt
        assert.equal(schemaName, 'story-lesson')
        return makeLesson({ order: 1, start: 1, end: 1, word: 'alpha', gloss: '阿尔法' })
      },
    })

    assert.equal(dbTouched, false)
    assert.equal(receivedPrompt, 'PREVIEW PROMPT alpha 阿尔法')
    assert.equal(report.courseStatus, 'from_pre_lessons')
    assert.equal(report.generatedLessonCount, 1)
    const output = JSON.parse(await readFile(join(checkpointDir, 'lesson-0001.json'), 'utf8'))
    assert.equal(output.kind, 'generated-story-lesson')
    assert.equal(output.lesson.order, 1)
    assert.equal(output.lesson.paragraphs[0].segments[1].word, 'alpha')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('summary and outline checkpoints reject changed input fingerprints', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-fingerprints-'))
  const summariesPath = join(tempDir, 'summaries.json')
  const outlinePath = join(tempDir, 'outline.json')
  const chapters = [{ order: 1, title: '第一章', text: '正文一' }]

  try {
    await buildChapterSummaries({
      chapters,
      sourceFingerprint: 'source-a',
      chapterBatchSize: 1,
      checkpointPath: summariesPath,
      generateJson: async () => ({ summary: '有效摘要', characters: ['方源'], events: ['事件'] }),
    })
    const summaryCheckpoint = JSON.parse(await readFile(summariesPath, 'utf8'))
    assert.equal(summaryCheckpoint.version, 2)
    assert.equal(summaryCheckpoint.sourceFingerprint, 'source-a')
    assert.equal(typeof summaryCheckpoint.summaries[0].inputFingerprint, 'string')

    await assert.rejects(
      buildChapterSummaries({
        chapters: [{ ...chapters[0], text: '改变后的正文' }],
        sourceFingerprint: 'source-b',
        chapterBatchSize: 1,
        checkpointPath: summariesPath,
        generateJson: async () => ({ summary: '不会使用', characters: ['方源'], events: ['事件'] }),
      }),
      /fingerprint|source/i,
    )

    const summaries = makeSummaries(61)
    await buildStoryOutline({
      chapterSummaries: summaries,
      sourceFingerprint: 'source-a',
      vocabularyCount: 6098,
      checkpointPath: outlinePath,
      generateJson: async () => ({ lessons: makeOutlineLessons(61) }),
    })
    const outlineCheckpoint = JSON.parse(await readFile(outlinePath, 'utf8'))
    assert.equal(outlineCheckpoint.version, 2)
    assert.equal(typeof outlineCheckpoint.inputFingerprint, 'string')
    assert.equal(typeof outlineCheckpoint.summaryFingerprint, 'string')

    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: summaries.map((summary, index) => index === 0 ? { ...summary, summary: '已改变' } : summary),
        sourceFingerprint: 'source-a',
        vocabularyCount: 6098,
        checkpointPath: outlinePath,
        generateJson: async () => ({ lessons: makeOutlineLessons(61) }),
      }),
      /fingerprint|summary/i,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('outline capacity must cover every vocabulary word before checkpointing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-capacity-'))
  const checkpointPath = join(tempDir, 'outline.json')
  try {
    await assert.rejects(
      buildStoryOutline({
        chapterSummaries: makeSummaries(61),
        sourceFingerprint: 'source',
        vocabularyCount: 6098,
        checkpointPath,
        generateJson: async () => ({ lessons: makeOutlineLessons(61, 99) }),
      }),
      /capacity.*6098|6098.*capacity/i,
    )
    assert.equal(existsSync(checkpointPath), false)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('outline validation accepts exact source-index coverage when source numbering has gaps', () => {
  const sourceOrders = [1, ...Array.from({ length: 60 }, (_, index) => index + 3)]
  const lessons = makeOutlineLessons(61).map((lesson, index) => ({
    ...lesson,
    sourceChapterStart: sourceOrders[index],
    sourceChapterEnd: sourceOrders[index],
  }))
  assert.doesNotThrow(() => validateStoryOutline(
    { vocabularyCount: 6098, lessons },
    [],
    { sourceChapters: sourceOrders.map((order) => ({ order })) },
  ))
})

test('corpus validation follows actual source-index orders and detects omitted chapters', () => {
  const sourceChapters = [{ order: 1 }, { order: 3 }, { order: 4 }]
  const valid = validateCorpus({
    lessons: [makeLesson({ order: 1, start: 1, end: 1, word: 'alpha' }), makeLesson({ order: 2, start: 3, end: 4, word: 'beta' })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 2,
    maxLessons: 2,
    sourceChapters,
    requireReadyStatus: false,
  })
  assert.equal(valid.ok, true, valid.errors.join('\n'))

  const omitted = validateCorpus({
    lessons: [makeLesson({ order: 1, start: 1, end: 1, word: 'alpha' }), makeLesson({ order: 2, start: 4, end: 4, word: 'beta' })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 2,
    maxLessons: 2,
    sourceChapters,
    requireReadyStatus: false,
  })
  assert.equal(omitted.ok, false)
  assert.match(omitted.errors.join('\n'), /omitted source chapter 3/i)
})

test('lesson checkpoints bind outline assignment and prior continuity', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'story-lesson-checkpoint-'))
  const words = [
    { id: 'word-alpha', text: 'alpha', meaning: { id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '释义-alpha' } },
    { id: 'word-beta', text: 'beta', meaning: { id: 'meaning-beta', wordId: 'word-beta', definitionCn: '释义-beta' } },
  ]
  const assignments = [
    { lessonOrder: 1, outlineLesson: makeOutlineLessons(2)[0], words: [words[0]], capacity: 1 },
    { lessonOrder: 2, outlineLesson: makeOutlineLessons(2)[1], words: [words[1]], capacity: 1 },
  ]
  let calls = 0
  const generateJson = async () => {
    calls += 1
    const assignment = assignments[calls - 1]
    return makeLesson({
      order: assignment.lessonOrder,
      start: assignment.outlineLesson.sourceChapterStart,
      end: assignment.outlineLesson.sourceChapterEnd,
      word: assignment.words[0].text,
      gloss: assignment.words[0].meaning.definitionCn,
    })
  }

  try {
    await generateLessonsFromAssignments({ assignments, generateJson, checkpointDir: tempDir })
    const checkpoint = JSON.parse(await readFile(join(tempDir, 'lesson-0002.json'), 'utf8'))
    assert.equal(checkpoint.version, 2)
    assert.equal(typeof checkpoint.inputFingerprint, 'string')
    assert.equal(typeof checkpoint.priorContinuityFingerprint, 'string')

    calls = 0
    await generateLessonsFromAssignments({
      assignments,
      checkpointDir: tempDir,
      existingLessonsByOrder: new Map([
        [1, { status: 'ready', contentJson: JSON.stringify(makeLesson({ order: 1, start: 1, end: 1, word: 'alpha', gloss: '释义-alpha', continuityNotes: 'changed handoff' })) }],
        [2, { status: 'failed' }],
      ]),
      generateJson: async () => {
        calls += 1
        return makeLesson({ order: 2, start: 2, end: 2, word: 'beta', gloss: '释义-beta' })
      },
    })
    assert.equal(calls, 1, 'changed prior continuity must invalidate lesson 2 checkpoint')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

function makePublicationPrisma() {
  const state = {
    courses: new Map(),
    lessons: new Map(),
    lessonWords: new Map(),
    words: new Map(),
    nextCourse: 1,
    nextLesson: 1,
  }

  const cloneState = () => structuredClone({
    courses: [...state.courses], lessons: [...state.lessons], lessonWords: [...state.lessonWords], words: [...state.words],
    nextCourse: state.nextCourse, nextLesson: state.nextLesson,
  })
  const restore = (snapshot) => {
    state.courses = new Map(snapshot.courses)
    state.lessons = new Map(snapshot.lessons)
    state.lessonWords = new Map(snapshot.lessonWords)
    state.words = new Map(snapshot.words)
    state.nextCourse = snapshot.nextCourse
    state.nextLesson = snapshot.nextLesson
  }
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'id' && typeof value === 'object' && value.not) return row.id !== value.not
    return row[key] === value
  })

  const client = {
    state,
    async $transaction(callback) {
      const snapshot = cloneState()
      try { return await callback(client) } catch (error) { restore(snapshot); throw error }
    },
    word: {
      async findUnique({ where }) { return state.words.get(where.id) ?? null },
      async update({ where, data }) {
        const row = { ...state.words.get(where.id), ...data }
        state.words.set(where.id, row)
        return row
      },
    },
    storyCourse: {
      async findFirst({ where, orderBy } = {}) {
        const rows = [...state.courses.values()].filter((row) => matches(row, where))
        if (orderBy?.version === 'desc') rows.sort((a, b) => b.version - a.version)
        return rows[0] ?? null
      },
      async findMany({ where } = {}) { return [...state.courses.values()].filter((row) => matches(row, where)) },
      async findUnique({ where, include } = {}) {
        const row = where.readySlot
          ? [...state.courses.values()].find((course) => course.readySlot === where.readySlot) ?? null
          : state.courses.get(where.id) ?? null
        if (!row || !include?.lessons) return row
        return { ...row, lessons: [...state.lessons.values()].filter((lesson) => lesson.courseId === row.id).sort((a, b) => a.order - b.order) }
      },
      async aggregate() { return { _max: { version: Math.max(0, ...[...state.courses.values()].map((row) => row.version)) || null } } },
      async create({ data }) {
        const row = { id: `course-${state.nextCourse++}`, ...data }
        state.courses.set(row.id, row)
        return row
      },
      async update({ where, data }) {
        const row = { ...state.courses.get(where.id), ...data }
        state.courses.set(where.id, row)
        return row
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const [id, row] of state.courses) if (matches(row, where)) { state.courses.set(id, { ...row, ...data }); count += 1 }
        return { count }
      },
    },
    storyLesson: {
      async findUnique({ where }) {
        const key = where.courseId_order
        return [...state.lessons.values()].find((row) => row.courseId === key.courseId && row.order === key.order) ?? null
      },
      async upsert({ where, create, update }) {
        const key = where.courseId_order
        const current = [...state.lessons.values()].find((row) => row.courseId === key.courseId && row.order === key.order)
        if (current) {
          const row = { ...current, ...update }
          state.lessons.set(row.id, row)
          return row
        }
        const row = { id: `lesson-${state.nextLesson++}`, ...create }
        state.lessons.set(row.id, row)
        return row
      },
      async update({ where, data }) {
        const row = { ...state.lessons.get(where.id), ...data }
        state.lessons.set(row.id, row)
        return row
      },
    },
    storyLessonWord: {
      async deleteMany({ where }) {
        for (const [id, row] of state.lessonWords) if (row.lessonId === where.lessonId) state.lessonWords.delete(id)
      },
      async createMany({ data }) {
        data.forEach((row, index) => state.lessonWords.set(`${row.lessonId}-${index + 1}`, { id: `${row.lessonId}-${index + 1}`, ...row }))
        return { count: data.length }
      },
    },
  }
  return client
}

const fingerprints = {
  sourceFingerprint: 'source',
  summaryFingerprint: 'summary',
  outlineFingerprint: 'outline',
  assignmentFingerprint: 'assignment',
}

test('ready-course lookup is bound to the unique ready slot instead of stale ready statuses', async () => {
  const prisma = makePublicationPrisma()
  prisma.state.courses.set('ready-a', { id: 'ready-a', version: 1, status: READY_COURSE_STATUS, readySlot: null, ...fingerprints })
  prisma.state.courses.set('ready-b', { id: 'ready-b', version: 2, status: READY_COURSE_STATUS, readySlot: null, ...fingerprints })

  assert.equal(await findReadyCourse(prisma), null)
})

test('draft lesson writes recheck course mutability before any lesson upsert', async () => {
  let rootUpsertCount = 0
  let transactionUpsertCount = 0
  const draftCourse = { id: 'course-race', status: DRAFT_COURSE_STATUS, readySlot: null }
  const publishedCourse = { ...draftCourse, status: READY_COURSE_STATUS, readySlot: READY_COURSE_SLOT }
  const transactionClient = {
    storyCourse: { findUnique: async () => publishedCourse },
    storyLesson: {
      upsert: async () => { transactionUpsertCount += 1; return { id: 'unexpected' } },
      update: async () => { throw new Error('unexpected lesson update') },
    },
    storyLessonWord: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
  }
  const prisma = {
    storyCourse: { findUnique: async () => draftCourse },
    storyLesson: {
      upsert: async () => { rootUpsertCount += 1; return { id: 'root-mutation' } },
    },
    $transaction: async (operation) => operation(transactionClient),
  }

  await assert.rejects(
    persistDraftLesson({
      prisma,
      courseId: draftCourse.id,
      lessonDocument: makeLesson({ order: 1, start: 1, end: 1, word: 'alpha' }),
      wordMap: new Map(),
      meaningMap: new Map(),
    }),
    /published\/immutable|draft/i,
  )
  assert.equal(rootUpsertCount, 0)
  assert.equal(transactionUpsertCount, 0)
})

test('draft course publication is atomic, archives prior ready course, and preserves published identities', async () => {
  const prisma = makePublicationPrisma()
  const oldCourse = { id: 'course-old', version: 1, status: READY_COURSE_STATUS, readySlot: READY_COURSE_SLOT, ...fingerprints }
  const oldLesson = { id: 'lesson-old', courseId: oldCourse.id, order: 1, status: 'ready', contentJson: JSON.stringify(makeLesson({ order: 1, start: 1, end: 1, word: 'old' })) }
  prisma.state.courses.set(oldCourse.id, oldCourse)
  prisma.state.lessons.set(oldLesson.id, oldLesson)

  const draft = await createOrResumeDraftCourse({ prisma, fingerprints })
  assert.equal(draft.status, DRAFT_COURSE_STATUS)
  prisma.state.words.set('word-alpha', { id: 'word-alpha', text: 'alpha', phonetic: null })
  const wordMap = new Map([['alpha', { id: 'word-alpha', text: 'alpha', phonetic: null }]])
  const meaningMap = new Map([['alpha', { id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '释义-alpha' }]])
  await persistDraftLesson({ prisma, courseId: draft.id, lessonDocument: makeLesson({ order: 1, start: 1, end: 1, word: 'alpha' }), wordMap, meaningMap })

  const published = await publishDraftCourse({ prisma, courseId: draft.id, validateCourse: () => ({ ok: true, errors: [] }) })
  assert.equal(published.course.status, READY_COURSE_STATUS)
  assert.equal(prisma.state.courses.get(oldCourse.id).status, ARCHIVED_COURSE_STATUS)
  assert.equal(prisma.state.courses.get(oldCourse.id).readySlot, null)
  assert.equal(prisma.state.lessons.get(oldLesson.id).id, 'lesson-old')
  assert.deepEqual([...prisma.state.courses.values()].filter((course) => course.readySlot === READY_COURSE_SLOT).map((course) => course.id), [draft.id])

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: oldCourse.id, lessonDocument: makeLesson({ order: 1, start: 1, end: 1, word: 'alpha' }), wordMap, meaningMap }),
    /immutable|draft/i,
  )
})

test('failed final validation leaves prior ready course published and draft resumable', async () => {
  const prisma = makePublicationPrisma()
  prisma.state.courses.set('ready', { id: 'ready', version: 1, status: READY_COURSE_STATUS, readySlot: READY_COURSE_SLOT, ...fingerprints })
  const draft = await createOrResumeDraftCourse({ prisma, fingerprints: { ...fingerprints, assignmentFingerprint: 'new-assignment' } })

  await assert.rejects(
    publishDraftCourse({ prisma, courseId: draft.id, validateCourse: () => ({ ok: false, errors: ['interrupted/incomplete corpus'] }) }),
    /interrupted\/incomplete corpus/,
  )
  assert.equal(prisma.state.courses.get('ready').status, READY_COURSE_STATUS)
  assert.equal(prisma.state.courses.get('ready').readySlot, READY_COURSE_SLOT)
  assert.equal(prisma.state.courses.get(draft.id).status, DRAFT_COURSE_STATUS)
})
