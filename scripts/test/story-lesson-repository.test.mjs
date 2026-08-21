import test from 'node:test'
import assert from 'node:assert/strict'

import { persistReadyLesson } from '../lib/story-lesson-repository.mjs'
import { validateReadyLessons } from '../validate-story-lessons.mjs'

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

function makeFakePrisma() {
  const state = {
    lessons: new Map(),
    lessonWords: new Map(),
    nextLessonId: 1,
    nextLessonWordId: 1,
  }

  const client = {
    state,
    async $transaction(callback) {
      return callback(client)
    },
    storyLesson: {
      async upsert({ where, create, update }) {
        const current = [...state.lessons.values()].find((lesson) => lesson.order === where.order)
        if (current) {
          const next = { ...current, ...update }
          state.lessons.set(current.id, next)
          return next
        }
        const lesson = { id: `lesson-${state.nextLessonId++}`, ...create }
        state.lessons.set(lesson.id, lesson)
        return lesson
      },
      async findFirst({ where }) {
        return [...state.lessons.values()].find((lesson) => lesson.order === where.order) ?? null
      },
      async create({ data }) {
        const lesson = { id: `lesson-${state.nextLessonId++}`, ...data }
        state.lessons.set(lesson.id, lesson)
        return lesson
      },
      async update({ where, data }) {
        const current = state.lessons.get(where.id)
        const next = { ...current, ...data }
        state.lessons.set(where.id, next)
        return next
      },
    },
    storyLessonWord: {
      async deleteMany({ where }) {
        for (const [id, row] of [...state.lessonWords.entries()]) {
          if (row.lessonId === where.lessonId) state.lessonWords.delete(id)
        }
      },
      async createMany({ data }) {
        for (const row of data) {
          const duplicate = [...state.lessonWords.values()].find((existing) => existing.lessonId === row.lessonId && existing.wordId === row.wordId)
          if (duplicate) throw new Error('unique violation')
          const id = `lesson-word-${state.nextLessonWordId++}`
          state.lessonWords.set(id, { id, ...row })
        }
        return { count: data.length }
      },
    },
  }

  return client
}

test('valid lesson is persisted idempotently with one StoryLessonWord per target segment', async () => {
  const prisma = makeFakePrisma()
  const lessonDocument = makeLessonDocument()
  const wordMap = new Map([
    ['alpha', { id: 'word-alpha', text: 'alpha' }],
    ['beta', { id: 'word-beta', text: 'beta' }],
  ])
  const meaningMap = new Map([
    ['alpha', { id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '阿尔法' }],
    ['beta', { id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }],
  ])

  const first = await persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap })
  const second = await persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap })

  assert.equal(first.lessonId, second.lessonId)
  assert.equal(first.createdWordCount, 2)
  assert.equal(second.createdWordCount, 2)
  assert.equal(prisma.state.lessons.size, 1)
  assert.equal(prisma.state.lessonWords.size, 2)
  assert.deepEqual([...prisma.state.lessonWords.values()].map((row) => row.sortOrder), [1, 2])
  assert.equal([...prisma.state.lessons.values()][0].status, 'ready')
})

test('Meaning/Word mismatches are rejected in application validation before ready persistence', async () => {
  const prisma = makeFakePrisma()
  const lessonDocument = makeLessonDocument()
  const wordMap = new Map([
    ['alpha', { id: 'word-alpha', text: 'alpha' }],
    ['beta', { id: 'word-beta', text: 'beta' }],
  ])
  const meaningMap = new Map([
    ['alpha', { id: 'meaning-alpha', wordId: 'different-word', definitionCn: '阿尔法' }],
    ['beta', { id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }],
  ])

  await assert.rejects(
    persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap }),
    /meaning-alpha.*does not belong to word alpha/,
  )

  const lesson = [...prisma.state.lessons.values()][0]
  assert.equal(lesson.status, 'failed')
  assert.match(lesson.generationError, /meaning-alpha/)
  assert.equal(prisma.state.lessonWords.size, 0)
})


test('duplicate target segments are rejected by repository before ready persistence', async () => {
  const prisma = makeFakePrisma()
  const lessonDocument = makeLessonDocument()
  lessonDocument.paragraphs[0].segments.push(
    { type: 'text', value: ' 重复 ' },
    { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', wordOrder: 3 },
  )
  const wordMap = new Map([
    ['alpha', { id: 'word-alpha', text: 'alpha' }],
    ['beta', { id: 'word-beta', text: 'beta' }],
  ])
  const meaningMap = new Map([
    ['alpha', { id: 'meaning-alpha', wordId: 'word-alpha', definitionCn: '阿尔法' }],
    ['beta', { id: 'meaning-beta', wordId: 'word-beta', definitionCn: '贝塔' }],
  ])

  await assert.rejects(
    persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap }),
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
