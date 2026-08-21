import test from 'node:test'
import assert from 'node:assert/strict'

import { assignWordsToOutline, createLessonPrompt, generateLesson, generateLessonsFromAssignments, validateCorpus } from '../lib/story-lesson-generator.mjs'

function words(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: `word-${offset + index + 1}`,
    text: `word${offset + index + 1}`,
    groupSortOrder: 1,
    itemSortOrder: offset + index + 1,
    meaning: {
      id: `meaning-${offset + index + 1}`,
      wordId: `word-${offset + index + 1}`,
      definitionCn: `释义${offset + index + 1}`,
    },
  }))
}

function outline(count, capacity = 100) {
  return {
    lessons: Array.from({ length: count }, (_, index) => ({
      order: index + 1,
      sourceChapterStart: index + 1,
      sourceChapterEnd: index + 1,
      plotSummary: `第${index + 1}课剧情`,
      characters: ['方源'],
      events: [`事件${index + 1}`],
      continuityStart: `开始${index + 1}`,
      continuityEnd: `结束${index + 1}`,
      targetWordCapacity: capacity,
    })),
  }
}

function documentFor(outlineLesson, targetWords) {
  return {
    title: `第${outlineLesson.order}课故事`,
    order: outlineLesson.order,
    sourceChapterStart: String(outlineLesson.sourceChapterStart),
    sourceChapterEnd: String(outlineLesson.sourceChapterEnd),
    sourceSummary: outlineLesson.plotSummary,
    continuityNotes: outlineLesson.continuityEnd,
    paragraphs: [{
      sceneTitle: '场景',
      segments: targetWords.flatMap((word, index) => [
        { type: 'text', value: `文本${index + 1}` },
        { type: 'targetWord', word: word.text, definitionCn: word.meaning.definitionCn, phonetic: '/wɜːd/', wordOrder: index + 1 },
      ]),
    }],
  }
}

test('205 words are split into three assignments with no assignment over 100', () => {
  const { assignments, unassignedWords } = assignWordsToOutline({
    wordGroups: [{ sortOrder: 1, items: words(205).map((word, index) => ({ sortOrder: index + 1, word })) }],
    outline: outline(3, 100),
  })

  assert.deepEqual(assignments.map((assignment) => assignment.words.length), [100, 100, 5])
  assert.equal(unassignedWords.length, 0)
  assert.equal(assignments.every((assignment) => assignment.words.length <= 100), true)
})

test('WordGroup order is preserved when the story outline has capacity', () => {
  const groupTwo = words(3, 3)
  const groupOne = words(3)
  const { assignments } = assignWordsToOutline({
    wordGroups: [
      { sortOrder: 2, items: groupTwo.map((word, index) => ({ sortOrder: index + 1, word })) },
      { sortOrder: 1, items: groupOne.map((word, index) => ({ sortOrder: index + 1, word })) },
    ],
    outline: outline(1, 10),
  })

  assert.deepEqual(assignments[0].words.map((word) => word.text), ['word1', 'word2', 'word3', 'word4', 'word5', 'word6'])
})

test('generated lesson missing a requested word is rejected before it can be persisted', async () => {
  const targetWords = words(2)

  await assert.rejects(
    generateLesson({
      outlineLesson: outline(1, 100).lessons[0],
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => documentFor(outline(1, 100).lessons[0], targetWords.slice(0, 1)),
    }),
    /missing target words: word2/,
  )
})

test('lesson prompt explicitly requires Simplified Chinese narrative text', () => {
  const prompt = createLessonPrompt({ outlineLesson: outline(1, 100).lessons[0], words: words(1) })
  assert.match(prompt, /Simplified Chinese|简体中文/)
  assert.match(prompt, /Simplified Chinese.*narrative text|简体中文.*叙事文本/i)
})

test('generated lesson prompt includes continuity, chapter range, full word list, and glosses', async () => {
  const targetWords = words(2)
  let prompt = ''
  const lesson = await generateLesson({
    outlineLesson: outline(1, 100).lessons[0],
    words: targetWords,
    previousLesson: { continuityNotes: '上一课结束' },
    nextLesson: { continuityStart: '下一课开始' },
    generateJson: async (value, schemaName) => {
      prompt = value
      assert.equal(schemaName, 'story-lesson')
      return documentFor(outline(1, 100).lessons[0], targetWords)
    },
  })

  assert.equal(lesson.order, 1)
  assert.match(prompt, /source chapter range/i)
  assert.match(prompt, /previous lesson continuity end/i)
  assert.match(prompt, /current plot summary/i)
  assert.match(prompt, /next lesson continuity start/i)
  assert.match(prompt, /complete target-word list/i)
  assert.match(prompt, /contextual Chinese gloss/i)
  assert.match(prompt, /canonical IPA/i)
  assert.match(prompt, /phonetic/i)
  assert.match(prompt, /no target word omitted/i)
  assert.match(prompt, /word1/)
  assert.match(prompt, /释义2/)
})



test('generated lesson rejects a target word with missing phonetic enrichment', async () => {
  const targetWords = words(1)
  const outlineLesson = outline(1, 100).lessons[0]

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      generateJson: async () => {
        const document = documentFor(outlineLesson, targetWords)
        delete document.paragraphs[0].segments[1].phonetic
        return document
      },
    }),
    /phonetic must be a non-empty string/,
  )
})

test('corpus validation reports full coverage, caps, monotonic ranges, and status errors', () => {
  const lessonOne = documentFor({ ...outline(1, 100).lessons[0], sourceChapterEnd: 1 }, words(2))
  const lessonTwo = documentFor({ ...outline(1, 100).lessons[0], order: 2, sourceChapterStart: 2, sourceChapterEnd: 2 }, words(1, 2))
  lessonTwo.status = 'ready'
  lessonOne.status = 'ready'

  const report = validateCorpus({
    lessons: [lessonOne, lessonTwo],
    allWordTexts: ['word1', 'word2', 'word3'],
    minLessons: 2,
    maxLessons: 3,
    maxWordsPerLesson: 100,
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.errors, [])
})


test('generated lesson must match outline order and source range exactly', async () => {
  const targetWords = words(1)
  const outlineLesson = outline(1, 100).lessons[0]

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => ({
        ...documentFor(outlineLesson, targetWords),
        order: 2,
      }),
    }),
    /lesson order 2 does not match outline order 1/,
  )

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => ({
        ...documentFor(outlineLesson, targetWords),
        sourceChapterStart: '2',
      }),
    }),
    /sourceChapterStart 2 does not match outline sourceChapterStart 1/,
  )
})

test('generated target segments must be assigned words exactly once in assigned order', async () => {
  const targetWords = words(2)
  const outlineLesson = outline(1, 100).lessons[0]

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => documentFor(outlineLesson, [targetWords[1], targetWords[0]]),
    }),
    /target segment 1 word word2 does not match assigned word word1/,
  )
})

test('generated target segments must use contiguous wordOrder and exact assigned glosses', async () => {
  const targetWords = words(2)
  const outlineLesson = outline(1, 100).lessons[0]

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => {
        const doc = documentFor(outlineLesson, targetWords)
        doc.paragraphs[0].segments[3].wordOrder = 3
        return doc
      },
    }),
    /wordOrder 3 does not match expected contiguous wordOrder 2/,
  )

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => {
        const doc = documentFor(outlineLesson, targetWords)
        doc.paragraphs[0].segments[3].definitionCn = '错误释义'
        return doc
      },
    }),
    /gloss 错误释义 does not match assigned gloss 释义2/,
  )
})

test('duplicate generated target segments are rejected', async () => {
  const targetWords = words(2)
  const outlineLesson = outline(1, 100).lessons[0]

  await assert.rejects(
    generateLesson({
      outlineLesson,
      words: targetWords,
      previousLesson: null,
      nextLesson: null,
      generateJson: async () => documentFor(outlineLesson, [targetWords[0], targetWords[0]]),
    }),
    /duplicate target word segment: word1/,
  )
})

test('generation resume skips only lessons before the first non-ready lesson', async () => {
  const assignmentWords = words(3)
  const outlineLessons = outline(3, 100).lessons
  const assignments = outlineLessons.map((outlineLesson, index) => ({
    lessonOrder: outlineLesson.order,
    outlineLesson,
    words: [assignmentWords[index]],
  }))
  const generatedOrders = []
  const persistedOrders = []

  const lessons = await generateLessonsFromAssignments({
    assignments,
    existingLessonsByOrder: new Map([
      [1, { status: 'ready', contentJson: JSON.stringify(documentFor(outlineLessons[0], [assignmentWords[0]])) }],
      [2, { status: 'failed' }],
      [3, { status: 'ready', contentJson: JSON.stringify(documentFor(outlineLessons[2], [assignmentWords[2]])) }],
    ]),
    generateJson: async (prompt) => {
      const order = prompt.includes('source chapter range: 2-2') ? 2 : 3
      generatedOrders.push(order)
      return documentFor(outlineLessons[order - 1], [assignmentWords[order - 1]])
    },
    persistLesson: async (lessonDocument) => {
      persistedOrders.push(lessonDocument.order)
    },
  })

  assert.deepEqual(generatedOrders, [2, 3])
  assert.deepEqual(persistedOrders, [2, 3])
  assert.deepEqual(lessons.map((lesson) => lesson.order), [1, 2, 3])
})
