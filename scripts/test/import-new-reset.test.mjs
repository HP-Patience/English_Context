import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DESTRUCTIVE_VOCABULARY_RESET_ORDER,
  destructiveVocabularyReset,
} from '../lib/destructive-vocabulary-reset.js'
import { importVocabularyData } from '../lib/import-new-runner.js'

const expectedOrder = [
  'userStoryParagraphBookmark',
  'userStoryParagraphCompletion',
  'userStoryStepCompletion',
  'userStoryLessonCompletion',
  'storyReviewAttempt',
  'userStoryWordProgress',
  'userStoryProgress',
  'storyLessonWord',
  'storyLesson',
  'storyCourse',
  'reviewLog',
  'reviewSession',
  'generatedSentence',
  'userWordMeaning',
  'userWord',
  'meaning',
  'wordGroupItem',
  'wordGroup',
  'word',
]

function resetFake({ failAt } = {}) {
  const committed = []
  const prisma = {
    async $transaction(callback) {
      const staged = []
      const tx = Object.fromEntries(expectedOrder.map((model) => [model, {
        async deleteMany() {
          staged.push(model)
          if (model === failAt) throw new Error(`delete failed: ${model}`)
          return { count: 1 }
        },
      }]))
      const result = await callback(tx)
      committed.push(...staged)
      return result
    },
  }
  return { prisma, committed }
}

function foreignKeyResetFake() {
  const rows = Object.fromEntries(expectedOrder.map((model) => [model, [{ id: `${model}-1` }]]))
  const lessonDependents = expectedOrder.slice(0, 8)
  const prisma = {
    async $transaction(callback) {
      const tx = Object.fromEntries(expectedOrder.map((model) => [model, {
        async deleteMany() {
          if (model === 'storyLesson' && lessonDependents.some((dependent) => rows[dependent].length > 0)) {
            throw new Error('StoryLesson foreign key violation')
          }
          const count = rows[model].length
          rows[model] = []
          return { count }
        },
      }]))
      return callback(tx)
    },
  }
  return { prisma, rows }
}

test('destructive vocabulary reset deletes every story and vocabulary table in FK-safe order inside one transaction', async () => {
  const { prisma, committed } = resetFake()

  await destructiveVocabularyReset(prisma)

  assert.deepEqual(DESTRUCTIVE_VOCABULARY_RESET_ORDER, expectedOrder)
  assert.deepEqual(committed, expectedOrder)
})

test('destructive vocabulary reset is atomic when any delete fails', async () => {
  const { prisma, committed } = resetFake({ failAt: 'storyLesson' })

  await assert.rejects(destructiveVocabularyReset(prisma), /delete failed: storyLesson/)
  assert.deepEqual(committed, [])
})

test('destructive vocabulary reset removes every StoryLesson-dependent row before its parent', async () => {
  const { prisma, rows } = foreignKeyResetFake()

  await destructiveVocabularyReset(prisma)

  for (const model of expectedOrder) assert.deepEqual(rows[model], [], `${model} should be empty`)
})

test('the import path invokes destructive reset before the first insert', async () => {
  const calls = []
  const prisma = {
    user: { async upsert() { calls.push('user.upsert') } },
    word: {
      async create() { calls.push('word.create') },
      async findMany() { return [{ id: 'word-alpha', text: 'alpha' }] },
      async count() { return 1 },
    },
    userWord: {
      async create() { calls.push('userWord.create') },
      async count() { return 1 },
    },
    wordGroup: {
      async create() { calls.push('wordGroup.create'); return { id: 'group-1' } },
    },
    wordGroupItem: {
      async create() { calls.push('wordGroupItem.create') },
      async count() { return 1 },
    },
  }

  await importVocabularyData({
    prisma,
    userId: 'local-user',
    raw: '#核心词\nalpha\t/ˈælfə/',
    reset: async () => { calls.push('reset') },
    logger: { log() {}, warn() {} },
  })

  assert.equal(calls[0], 'reset')
  assert.ok(calls.indexOf('reset') < calls.indexOf('user.upsert'))
  assert.ok(calls.indexOf('reset') < calls.indexOf('word.create'))
})
