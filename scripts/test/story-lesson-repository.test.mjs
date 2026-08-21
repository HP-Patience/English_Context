import test from 'node:test'
import assert from 'node:assert/strict'

import { persistReadyLesson } from '../lib/story-lesson-repository.mjs'

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
        { type: 'text', value: ' 再复现 ' },
        { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', wordOrder: 2 },
        { type: 'text', value: ' 和 ' },
        { type: 'targetWord', word: 'beta', definitionCn: '贝塔', wordOrder: 3 },
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

test('valid lesson is persisted idempotently and repeated target words map to one StoryLessonWord', async () => {
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
  assert.deepEqual([...prisma.state.lessonWords.values()].map((row) => row.sortOrder), [1, 3])
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
