import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main as parseNovelCommand } from '../parse-novel.mjs'
import { main as buildOutlineCommand } from '../build-story-outline.mjs'
import { main as generateLessonsCommand } from '../generate-story-lessons.mjs'
import { main as validateLessonsCommand } from '../validate-story-lessons.mjs'
import { assignWordsToOutline } from '../lib/story-lesson-generator.mjs'
import { ARCHIVED_COURSE_STATUS, READY_COURSE_SLOT, READY_COURSE_STATUS } from '../lib/story-lesson-repository.mjs'
import { createFakeStoryPrisma } from './helpers/fake-story-prisma.mjs'

const CHAPTER_COUNT = 61
const WORD_COUNT = 205
const MAX_WORDS_PER_LESSON = 100
const GB18030_DI = Buffer.from([0xb5, 0xda])
const GB18030_ZHANG = Buffer.from([0xd5, 0xc2])

test('offline command smoke resumes interruption and atomically swaps the published course', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'story-pipeline-smoke-'))
  const rawPath = join(tempRoot, 'fixture-novel-gb18030.txt')
  const cacheDir = join(tempRoot, '.story-cache')
  const indexPath = join(cacheDir, 'novel-index.json')
  const chapterCheckpointPath = join(cacheDir, 'outline', 'chapter-summaries.json')
  const outlineCheckpointPath = join(cacheDir, 'outline', 'story-outline.checkpoint.json')
  const outlinePath = join(cacheDir, 'story-outline.json')
  const lessonCheckpointDir = join(cacheDir, 'lessons')
  const generationReportPath = join(cacheDir, 'story-generation-report.json')
  const generationProgressPath = join(cacheDir, 'story-generation-progress.json')
  const validationReportPath = join(cacheDir, 'story-validation-report.json')
  const logs = []
  const log = (message) => logs.push(String(message))
  const wordGroups = createFixtureWordGroups(WORD_COUNT)
  const prisma = createFakeStoryPrisma({ wordGroups })

  const oldCourse = {
    id: 'published-v1',
    version: 1,
    status: READY_COURSE_STATUS,
    readySlot: READY_COURSE_SLOT,
    sourceFingerprint: 'old-source',
    summaryFingerprint: 'old-summary',
    outlineFingerprint: 'old-outline',
    assignmentFingerprint: 'old-assignment',
  }
  const oldLesson = { id: 'published-lesson-v1', courseId: oldCourse.id, order: 1, status: 'ready', contentJson: '{}' }
  const oldLessonWord = { id: 'published-lesson-word-v1', lessonId: oldLesson.id, wordId: 'old-word', meaningId: 'old-meaning', sortOrder: 1, glossCn: '旧释义' }
  const oldProgress = { id: 'progress-v1', lessonId: oldLesson.id, lessonWordId: oldLessonWord.id }
  prisma.state.courses.set(oldCourse.id, oldCourse)
  prisma.state.lessons.set(oldLesson.id, oldLesson)
  prisma.state.lessonWords.set(oldLessonWord.id, oldLessonWord)
  prisma.state.userProgress = new Map([[oldProgress.id, oldProgress]])

  try {
    await writeFile(rawPath, createGb18030NovelFixture(CHAPTER_COUNT))

    const parseResult = await parseNovelCommand([
      '--source', rawPath,
      '--output', indexPath,
    ], { log })
    assert.equal(parseResult.chapterCount, CHAPTER_COUNT)
    assert.equal(parseResult.diagnostics.numberingGapCount, 0)

    const outline = await buildOutlineCommand([
      '--source', rawPath,
      '--index', indexPath,
      '--output', outlinePath,
      '--chapter-checkpoint', chapterCheckpointPath,
      '--outline-checkpoint', outlineCheckpointPath,
      '--vocabulary-count', String(WORD_COUNT),
    ], {
      log,
      loadEnvironment: false,
      env: {},
      generateJson: createOutlineCommandFake(),
    })
    assert.equal(outline.lessonCount, CHAPTER_COUNT)
    assert.equal(outline.vocabularyCount, WORD_COUNT)
    assert.match(outline.sourceFingerprint, /^[a-f0-9]{64}$/)

    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson: MAX_WORDS_PER_LESSON })
    assert.equal(assignmentResult.unassignedWords.length, 0)
    assert.equal(assignmentResult.report.assignedWordCount, WORD_COUNT)

    let interruptedOrder = 0
    await assert.rejects(
      generateLessonsCommand(generateArgs(), {
        prisma,
        log,
        loadEnvironment: false,
        env: {},
        generateJson: async (_prompt, schemaName) => {
          assert.equal(schemaName, 'story-lesson')
          interruptedOrder += 1
          if (interruptedOrder === 10) throw new Error('fixture generation interruption')
          const assignment = assignmentResult.assignments[interruptedOrder - 1]
          return createFixtureLessonDocument(assignment.outlineLesson, assignment.words)
        },
      }),
      /fixture generation interruption/,
    )

    const interruptionProgress = await readJson(generationProgressPath)
    assert.equal(interruptionProgress.status, 'failed')
    assert.equal(interruptionProgress.completedLessons, 9)
    assert.equal(interruptionProgress.currentLessonOrder, 10)

    const draftAfterInterruption = [...prisma.state.courses.values()].find((course) => course.status === 'draft')
    assert.ok(draftAfterInterruption)
    assert.equal([...prisma.state.lessons.values()].filter((lesson) => lesson.courseId === draftAfterInterruption.id && lesson.status === 'ready').length, 9)
    assertSingleReadyCourse(prisma, oldCourse.id)

    await assert.rejects(
      validateLessonsCommand(validateArgs(), {
        prisma,
        log,
        loadEnvironment: false,
        env: {},
      }),
      /story course validation failed/,
    )
    assert.equal(prisma.state.courses.get(draftAfterInterruption.id).status, 'draft')
    assertSingleReadyCourse(prisma, oldCourse.id)

    let resumedOrder = 9
    const generationReport = await generateLessonsCommand(generateArgs(), {
      prisma,
      log,
      loadEnvironment: false,
      env: {},
      generateJson: async (_prompt, schemaName) => {
        assert.equal(schemaName, 'story-lesson')
        resumedOrder += 1
        const assignment = assignmentResult.assignments[resumedOrder - 1]
        return createFixtureLessonDocument(assignment.outlineLesson, assignment.words)
      },
    })
    assert.equal(resumedOrder, CHAPTER_COUNT)
    assert.equal(generationReport.courseId, draftAfterInterruption.id)
    assert.equal(generationReport.wordCount, WORD_COUNT)
    const completedProgress = await readJson(generationProgressPath)
    assert.equal(completedProgress.status, 'completed')
    assert.equal(completedProgress.courseId, draftAfterInterruption.id)
    assert.equal(completedProgress.courseVersion, draftAfterInterruption.version)
    assert.equal(completedProgress.totalLessons, CHAPTER_COUNT)
    assert.equal(completedProgress.completedLessons, CHAPTER_COUNT)
    assert.equal(completedProgress.percent, 100)
    assert.equal([...prisma.state.words.values()].every((word) => word.phonetic === '/ˈfɪkstʃər wɜːd/'), true)

    const validationReport = await validateLessonsCommand(validateArgs(), {
      prisma,
      log,
      loadEnvironment: false,
      env: {},
    })
    assert.equal(validationReport.ok, true)
    assert.equal(validationReport.published, true)
    assert.equal(validationReport.lessonCount, CHAPTER_COUNT)
    assert.equal(validationReport.assignedWordCount, WORD_COUNT)
    assert.equal(validationReport.lessonWordLinkCount, WORD_COUNT)

    assert.equal(prisma.state.courses.get(oldCourse.id).status, ARCHIVED_COURSE_STATUS)
    assert.equal(prisma.state.courses.get(oldCourse.id).readySlot, null)
    assertSingleReadyCourse(prisma, draftAfterInterruption.id)
    assert.equal(prisma.state.lessons.get(oldLesson.id).id, oldLesson.id)
    assert.equal(prisma.state.lessonWords.get(oldLessonWord.id).id, oldLessonWord.id)
    assert.deepEqual(prisma.state.userProgress.get(oldProgress.id), oldProgress)

    const index = await readJson(indexPath)
    assert.equal(index.chapters.every((chapter) => chapter.text === undefined), true)
    assert.equal(JSON.stringify(index).includes('Fixture body'), false)
    assert.match(index.sourceFingerprint, /^[a-f0-9]{64}$/)
    assert.match(index.chapterIndexFingerprint, /^[a-f0-9]{64}$/)

    const failedPublicationReport = await readJson(validationReportPath)
    assert.equal(failedPublicationReport.published, true)
    for (const artifactPath of [indexPath, outlinePath, generationReportPath, validationReportPath]) {
      assert.equal(existsSync(artifactPath), true, `${artifactPath} should exist after the fixture run`)
    }
    assert.equal(logs.some((line) => /API_KEY|DATABASE_URL=.*|Fixture body/.test(line)), false)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }

  function generateArgs() {
    return [
      '--index', indexPath,
      '--outline', outlinePath,
      '--checkpoint-dir', lessonCheckpointDir,
      '--report', generationReportPath,
      '--progress', generationProgressPath,
      '--expected-word-count', String(WORD_COUNT),
      '--max-words-per-lesson', String(MAX_WORDS_PER_LESSON),
    ]
  }

  function validateArgs() {
    return [
      '--index', indexPath,
      '--outline', outlinePath,
      '--report', validationReportPath,
      '--expected-word-count', String(WORD_COUNT),
      '--min-lessons', String(CHAPTER_COUNT),
      '--max-lessons', String(CHAPTER_COUNT),
      '--max-words-per-lesson', String(MAX_WORDS_PER_LESSON),
    ]
  }
})

function assertSingleReadyCourse(prisma, expectedId) {
  const ready = [...prisma.state.courses.values()].filter((course) => course.readySlot === READY_COURSE_SLOT)
  assert.deepEqual(ready.map((course) => course.id), [expectedId])
}

function createOutlineCommandFake() {
  return async (prompt, schemaName) => {
    if (schemaName === 'chapter-summary') {
      const [, start, end] = prompt.match(/source chapters (\d+)-(\d+)/i)
      return {
        summary: `方源在第${start}至${end}章继续推进布局，局势逐步展开。`,
        characters: ['方源'],
        events: [`第${start}至${end}章的关键冲突`],
        continuityStart: `第${start}章开端承接前文局势。`,
        continuityEnd: `第${end}章结束时留下新的转折。`,
      }
    }
    assert.equal(schemaName, 'story-outline')
    return {
      lessons: Array.from({ length: CHAPTER_COUNT }, (_, index) => ({
        order: index + 1,
        sourceChapterStart: index + 1,
        sourceChapterEnd: index + 1,
        plotSummary: `第${index + 1}课中，方源围绕眼前危机继续谋划，故事冲突稳步推进。`,
        characters: ['方源'],
        events: [`第${index + 1}课的关键事件`],
        continuityStart: index === 0 ? '故事从方源重启命运开始。' : `承接第${index}课留下的局势。`,
        continuityEnd: index === CHAPTER_COUNT - 1 ? '整条故事线完成收束。' : `为第${index + 2}课留下新的变化。`,
        targetWordCapacity: MAX_WORDS_PER_LESSON,
      })),
    }
  }
}

function createGb18030NovelFixture(chapterCount) {
  const chunks = []
  for (let order = 1; order <= chapterCount; order += 1) {
    chunks.push(GB18030_DI, Buffer.from(String(order)), GB18030_ZHANG)
    chunks.push(Buffer.from(` Fixture Chapter ${order}\n`))
    chunks.push(Buffer.from(`Fixture body for chapter ${order}. Synthetic offline smoke data only.\n\n`))
  }
  return Buffer.concat(chunks)
}

function createFixtureWordGroups(wordCount) {
  return [{
    id: 'fixture-group-1',
    sortOrder: 1,
    words: Array.from({ length: wordCount }, (_, index) => {
      const order = index + 1
      const wordId = `fixture-word-${order}`
      return {
        sortOrder: order,
        word: {
          id: wordId,
          text: `fixtureWord${order}`,
          phonetic: null,
          meanings: [{
            id: `fixture-meaning-${order}`,
            wordId,
            definitionCn: `夹具释义${order}`,
          }],
        },
      }
    }),
  }]
}

function createFixtureLessonDocument(outlineLesson, words) {
  return {
    title: `第${outlineLesson.order}课故事`,
    order: outlineLesson.order,
    sourceChapterStart: String(outlineLesson.sourceChapterStart),
    sourceChapterEnd: String(outlineLesson.sourceChapterEnd),
    sourceSummary: outlineLesson.plotSummary,
    continuityNotes: outlineLesson.continuityEnd,
    paragraphs: [{
      sceneTitle: `第${outlineLesson.order}课场景`,
      segments: [
        { type: 'text', value: `方源在第${outlineLesson.order}课的场景中冷静观察局势。` },
        ...words.flatMap((word, index) => [
          { type: 'targetWord', word: word.text, definitionCn: word.meaning.definitionCn, phonetic: '/ˈfɪkstʃər wɜːd/', wordOrder: index + 1 },
          { type: 'text', value: `这个词被嵌入第${index + 1}处情节，帮助故事继续向前。` },
        ]),
      ],
    }],
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
