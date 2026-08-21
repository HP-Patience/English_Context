import test from 'node:test'
import assert from 'node:assert/strict'

import { createOrResumeDraftCourse, persistDraftLesson } from '../lib/story-lesson-repository.mjs'
import { validateReadyLessons } from '../validate-story-lessons.mjs'
import { createFakeStoryPrisma } from './helpers/fake-story-prisma.mjs'

const fingerprints = {
  sourceFingerprint: 'source',
  summaryFingerprint: 'summary',
  outlineFingerprint: 'outline',
  assignmentFingerprint: 'assignment',
}

function makeLessonDocument() {
  return {
    title: 'Story 1',
    order: 1,
    sourceChapterStart: '1',
    sourceChapterEnd: '1',
    sourceSummary: '剧情摘要',
    continuityNotes: '继续',
    paragraphs: [{
      sceneTitle: '场景',
      segments: [
        { type: 'text', value: '先学习 ' },
        { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', wordOrder: 1 },
        { type: 'text', value: ' 和 ' },
        { type: 'targetWord', word: 'beta', definitionCn: '贝塔', wordOrder: 2 },
      ],
    }],
  }
}

function makeMaps({ mismatchedMeaning = false } = {}) {
  return {
    wordMap: new Map([
      ['alpha', { id: 'word-alpha', text: 'alpha' }],
      ['beta', { id: 'word-beta', text: 'beta' }],
    ]),
    meaningMap: new Map([
      ['alpha', { id: 'meaning-alpha', wordId: mismatchedMeaning ? 'different-word' : 'word-alpha', definitionCn: '阿尔法' }],
      ['beta', { id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }],
    ]),
  }
}

async function makeDraftPrisma() {
  const prisma = createFakeStoryPrisma()
  const course = await createOrResumeDraftCourse({ prisma, fingerprints })
  return { prisma, course }
}

test('valid lesson is persisted idempotently inside one draft course with one StoryLessonWord per target segment', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps()

  const first = await persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap })
  const second = await persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap })

  assert.equal(first.lessonId, second.lessonId)
  assert.equal(first.createdWordCount, 2)
  assert.equal(second.createdWordCount, 2)
  assert.equal(prisma.state.lessons.size, 1)
  assert.equal(prisma.state.lessonWords.size, 2)
  assert.deepEqual([...prisma.state.lessonWords.values()].map((row) => row.sortOrder), [1, 2])
  assert.equal([...prisma.state.lessons.values()][0].status, 'ready')
  assert.equal([...prisma.state.lessons.values()][0].courseId, course.id)
  assert.equal(prisma.state.courses.get(course.id).status, 'draft')
})

test('Meaning/Word mismatches are rejected before a draft lesson becomes ready', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps({ mismatchedMeaning: true })

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    /meaning-alpha.*does not belong to word alpha/,
  )

  const lesson = [...prisma.state.lessons.values()][0]
  assert.equal(lesson.status, 'failed')
  assert.match(lesson.generationError, /meaning-alpha/)
  assert.equal(prisma.state.lessonWords.size, 0)
})

test('duplicate target segments are rejected by repository before draft-ready persistence', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  lessonDocument.paragraphs[0].segments.push(
    { type: 'text', value: ' 重复 ' },
    { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', wordOrder: 3 },
  )
  const { wordMap, meaningMap } = makeMaps()

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    /duplicate target word segment: alpha/,
  )

  const lesson = [...prisma.state.lessons.values()][0]
  assert.equal(lesson.status, 'failed')
  assert.equal(prisma.state.lessonWords.size, 0)
})

function makePersistedLesson({ rows = undefined } = {}) {
  const content = makeLessonDocument()
  const lessonId = 'lesson-1'
  const defaultRows = [
    {
      id: 'lw-alpha',
      lessonId,
      wordId: 'word-alpha',
      meaningId: 'meaning-alpha',
      sortOrder: 1,
      glossCn: '阿尔法',
      word: { id: 'word-alpha', text: 'alpha' },
      meaning: { id: 'meaning-alpha', wordId: 'word-alpha' },
    },
    {
      id: 'lw-beta',
      lessonId,
      wordId: 'word-beta',
      meaningId: 'meaning-beta',
      sortOrder: 2,
      glossCn: '贝塔',
      word: { id: 'word-beta', text: 'beta' },
      meaning: { id: 'meaning-beta', wordId: 'word-beta' },
    },
  ]
  return {
    id: lessonId,
    order: content.order,
    status: 'ready',
    contentJson: JSON.stringify(content),
    words: rows ?? defaultRows,
  }
}

test('story validation proves a bijection between target segments and StoryLessonWord rows', () => {
  const validReport = validateReadyLessons({
    lessons: [makePersistedLesson()],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(validReport.ok, true)

  const missingReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: makePersistedLesson().words.slice(0, 1) })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(missingReport.ok, false)
  assert.match(missingReport.errors.join('\n'), /has 2 target segments but 1 StoryLessonWord rows|missing StoryLessonWord row.*wordOrder 2/)

  const wrongRows = structuredClone(makePersistedLesson().words)
  wrongRows[1] = {
    ...wrongRows[1],
    wordId: 'word-gamma',
    glossCn: '错误释义',
    word: { id: 'word-gamma', text: 'gamma' },
    meaning: { id: 'meaning-gamma', wordId: 'word-gamma' },
  }
  const wrongReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: wrongRows })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(wrongReport.ok, false)
  assert.match(wrongReport.errors.join('\n'), /row word gamma does not match content target word beta/)
  assert.match(wrongReport.errors.join('\n'), /row glossCn 错误释义 does not match content gloss 贝塔/)
})
