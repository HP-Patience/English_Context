import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLessonDocument } from '../lib/story-content.mjs'

const valid = {
  title: 'Story 01：青茅山的重生',
  order: 1,
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第三章',
  sourceSummary: '方源在青茅山醒来并确认重生。',
  continuityNotes: '下一篇进入资质检测。',
  paragraphs: [{
    sceneTitle: '醒来',
    segments: [
      { type: 'text', value: '他回到了 ' },
      { type: 'targetWord', word: 'dorm', definitionCn: '宿舍', wordOrder: 1 },
      { type: 'text', value: '。' },
    ],
  }, {
    sceneTitle: '确认重生',
    segments: [
      { type: 'text', value: '窗外的山风提醒他，' },
      { type: 'targetWord', word: 'rebirth', definitionCn: '重生', wordOrder: 2 },
      { type: 'text', value: ' 已经发生，他必须准备下一次 ' },
      { type: 'targetWord', word: 'trial', definitionCn: '试炼', wordOrder: 3 },
      { type: 'text', value: '。' },
    ],
  }],
}

test('accepts a valid lesson document', () => {
  const result = validateLessonDocument(valid, { maxTargetWords: 100 })
  assert.equal(result.ok, true)
})

test('rejects a lesson with more than 100 target words', () => {
  const tooLarge = structuredClone(valid)
  tooLarge.paragraphs[0].segments = Array.from({ length: 101 }, (_, index) => ({
    type: 'targetWord', word: `word-${index}`, definitionCn: '释义', wordOrder: index + 1,
  }))
  tooLarge.paragraphs[1].segments = [{ type: 'text', value: '后续场景保留。' }]
  const result = validateLessonDocument(tooLarge, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /100/)
})

test('rejects duplicate target-word order and empty glosses', () => {
  const invalid = structuredClone(valid)
  invalid.paragraphs[0].segments.push({
    type: 'targetWord', word: 'dorm', definitionCn: '', wordOrder: 1,
  })
  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /wordOrder|definitionCn/)
})
