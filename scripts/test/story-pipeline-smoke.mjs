import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeNovelIndex } from '../lib/novel-parser.mjs'
import { buildChapterSummaries, buildStoryOutline, writeJsonAtomic } from '../lib/story-outline.mjs'
import { assignWordsToOutline, generateLessonsFromAssignments } from '../lib/story-lesson-generator.mjs'
import { buildWordAndMeaningMaps, READY_STATUS, resolveLessonWordRows } from '../lib/story-lesson-repository.mjs'
import { validateReadyLessons } from '../validate-story-lessons.mjs'
import { loadSourceChapters } from '../build-story-outline.mjs'

const CHAPTER_COUNT = 61
const WORD_COUNT = 205
const MAX_WORDS_PER_LESSON = 100

const GB18030_DI = Buffer.from([0xb5, 0xda])
const GB18030_ZHANG = Buffer.from([0xd5, 0xc2])

test('offline fixture verifies parse to outline to generation to validation without production services', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'story-pipeline-smoke-'))
  const rawPath = join(tempRoot, 'fixture-novel-gb18030.txt')
  const cacheDir = join(tempRoot, '.story-cache')
  const indexPath = join(cacheDir, 'novel-index.json')
  const chapterCheckpointPath = join(cacheDir, 'outline', 'chapter-summaries.json')
  const outlineCheckpointPath = join(cacheDir, 'outline', 'story-outline.checkpoint.json')
  const outlinePath = join(cacheDir, 'story-outline.json')
  const lessonCheckpointDir = join(cacheDir, 'lessons')
  const validationReportPath = join(cacheDir, 'story-validation-report.json')

  try {
    await writeFile(rawPath, createGb18030NovelFixture(CHAPTER_COUNT))

    const parseResult = await writeNovelIndex({ sourcePath: rawPath, outputPath: indexPath })
    assert.equal(parseResult.chapterCount, CHAPTER_COUNT)

    const novelIndex = await readJson(indexPath)
    assertJsonKeys(novelIndex, ['generatedAt', 'sourceEncoding', 'chapterCount', 'chapters'])
    assert.equal(novelIndex.sourceEncoding, 'gb18030')
    assert.equal(novelIndex.chapters.length, CHAPTER_COUNT)
    assert.equal(novelIndex.chapters.every((chapter) => chapter.text === undefined), true)

    const chapters = await loadSourceChapters({ sourcePath: rawPath, indexChapters: novelIndex.chapters })
    const chapterSummaries = await buildChapterSummaries({
      chapters,
      checkpointPath: chapterCheckpointPath,
      chapterBatchSize: 1,
      generateJson: createFakeChapterSummarizer(),
    })
    assert.equal(chapterSummaries.length, CHAPTER_COUNT)

    const outline = await buildStoryOutline({
      chapterSummaries,
      vocabularyCount: WORD_COUNT,
      checkpointPath: outlineCheckpointPath,
      generateJson: async (_prompt, schemaName) => {
        assert.equal(schemaName, 'story-outline')
        return createFixtureOutline(chapterSummaries)
      },
    })
    await writeJsonAtomic(outlinePath, outline)

    const outlineJson = await readJson(outlinePath)
    assertJsonKeys(outlineJson, ['generatedAt', 'lessonCount', 'vocabularyCount', 'lessons'])
    assert.equal(outlineJson.lessonCount, CHAPTER_COUNT)
    assert.equal(outlineJson.vocabularyCount, WORD_COUNT)

    const wordGroups = createFixtureWordGroups(WORD_COUNT)
    const { wordMap, meaningMap } = buildWordAndMeaningMaps(wordGroups)
    const wordsById = new Map([...wordMap.values()].map((word) => [word.id, word]))
    const meaningsById = new Map([...meaningMap.values()].map((meaning) => [meaning.id, meaning]))
    const assignmentResult = assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson: MAX_WORDS_PER_LESSON })
    const populatedAssignments = assignmentResult.assignments.filter((assignment) => assignment.words.length > 0)

    assert.equal(assignmentResult.unassignedWords.length, 0)
    assert.equal(assignmentResult.report.assignedWordCount, WORD_COUNT)
    assert.deepEqual(populatedAssignments.map((assignment) => assignment.words.length), [100, 100, 5])
    assert.equal(populatedAssignments.every((assignment) => assignment.words.length <= MAX_WORDS_PER_LESSON), true)

    const readyLessons = []
    let lessonCall = 0
    await generateLessonsFromAssignments({
      assignments: populatedAssignments,
      checkpointDir: lessonCheckpointDir,
      maxWordsPerLesson: MAX_WORDS_PER_LESSON,
      generateJson: async (_prompt, schemaName) => {
        assert.equal(schemaName, 'story-lesson')
        const assignment = populatedAssignments[lessonCall]
        lessonCall += 1
        return createFixtureLessonDocument(assignment.outlineLesson, assignment.words)
      },
      persistLesson: async (lessonDocument) => {
        const lessonId = `fixture-lesson-${lessonDocument.order}`
        const rows = resolveLessonWordRows({ lessonId, lessonDocument, wordMap, meaningMap })
        readyLessons.push({
          id: lessonId,
          title: lessonDocument.title,
          order: lessonDocument.order,
          sourceChapterStart: lessonDocument.sourceChapterStart,
          sourceChapterEnd: lessonDocument.sourceChapterEnd,
          sourceSummary: lessonDocument.sourceSummary,
          continuityNotes: lessonDocument.continuityNotes,
          status: READY_STATUS,
          contentJson: JSON.stringify(lessonDocument),
          words: rows.map((row) => ({
            ...row,
            id: `${row.lessonId}-${row.sortOrder}`,
            word: wordsById.get(row.wordId),
            meaning: meaningsById.get(row.meaningId),
          })),
        })
      },
    })

    assert.equal(lessonCall, 3)
    assert.equal(readyLessons.length, 3)

    const validationReport = validateReadyLessons({
      lessons: readyLessons,
      allWordTexts: [...wordMap.keys()],
      expectedWordCount: WORD_COUNT,
      minLessons: 3,
      maxLessons: 3,
      maxWordsPerLesson: MAX_WORDS_PER_LESSON,
    })
    await writeJsonAtomic(validationReportPath, validationReport)

    const reportJson = await readJson(validationReportPath)
    assertJsonKeys(reportJson, ['ok', 'errors', 'lessonCount', 'expectedWordCount', 'assignedWordCount', 'maxWordsPerLesson', 'lessonWordLinkCount'])
    assert.equal(reportJson.ok, true)
    assert.deepEqual(reportJson.errors, [])
    assert.equal(reportJson.lessonCount, 3)
    assert.equal(reportJson.expectedWordCount, WORD_COUNT)
    assert.equal(reportJson.assignedWordCount, WORD_COUNT)
    assert.equal(reportJson.lessonWordLinkCount, WORD_COUNT)
    assert.equal(reportJson.maxWordsPerLesson, MAX_WORDS_PER_LESSON)

    for (const artifactPath of [indexPath, outlinePath, validationReportPath]) {
      assert.equal(existsSync(artifactPath), true, `${artifactPath} should exist after the fixture run`)
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

function createGb18030NovelFixture(chapterCount) {
  const chunks = []
  for (let order = 1; order <= chapterCount; order += 1) {
    chunks.push(GB18030_DI, Buffer.from(String(order)), GB18030_ZHANG)
    chunks.push(Buffer.from(` Fixture Chapter ${order}\n`))
    chunks.push(Buffer.from(`Fixture body for chapter ${order}. The smoke test source is synthetic and offline.\n\n`))
  }
  return Buffer.concat(chunks)
}

function createFakeChapterSummarizer() {
  let call = 0
  return async (_prompt, schemaName) => {
    assert.equal(schemaName, 'chapter-summary')
    call += 1
    return {
      summary: `Fixture summary for chapter ${call}.`,
      characters: ['Fang Yuan'],
      events: [`Fixture event ${call}`],
      continuityStart: `Fixture chapter ${call} starts.`,
      continuityEnd: `Fixture chapter ${call} ends.`,
    }
  }
}

function createFixtureOutline(chapterSummaries) {
  return {
    lessons: chapterSummaries.map((summary, index) => ({
      order: index + 1,
      sourceChapterStart: summary.sourceChapterStart,
      sourceChapterEnd: summary.sourceChapterEnd,
      plotSummary: summary.summary,
      characters: summary.characters,
      events: summary.events,
      continuityStart: summary.continuityStart ?? `Fixture lesson ${index + 1} starts.`,
      continuityEnd: summary.continuityEnd ?? `Fixture lesson ${index + 1} ends.`,
      targetWordCapacity: index < 3 ? MAX_WORDS_PER_LESSON : 40,
    })),
  }
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
    title: `Fixture Story Lesson ${outlineLesson.order}`,
    order: outlineLesson.order,
    sourceChapterStart: String(outlineLesson.sourceChapterStart),
    sourceChapterEnd: String(outlineLesson.sourceChapterEnd),
    sourceSummary: outlineLesson.plotSummary,
    continuityNotes: outlineLesson.continuityEnd,
    paragraphs: [{
      sceneTitle: `Fixture scene ${outlineLesson.order}`,
      segments: [
        { type: 'text', value: `Offline fixture scene for lesson ${outlineLesson.order}.` },
        ...words.flatMap((word, index) => [
          { type: 'targetWord', word: word.text, definitionCn: word.meaning.definitionCn, wordOrder: index + 1 },
          { type: 'text', value: `Context sentence ${index + 1}.` },
        ]),
      ],
    }],
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function assertJsonKeys(value, keys) {
  for (const key of keys) {
    assert.equal(Object.hasOwn(value, key), true, `expected JSON key ${key}`)
  }
}