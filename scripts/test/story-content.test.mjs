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
      { type: 'targetWord', word: 'dorm', definitionCn: '宿舍', phonetic: '/dɔːm/', wordOrder: 1 },
      { type: 'text', value: '。' },
    ],
  }, {
    sceneTitle: '确认重生',
    segments: [
      { type: 'text', value: '窗外的山风提醒他，' },
      { type: 'targetWord', word: 'rebirth', definitionCn: '重生', phonetic: '/ˌriːˈbɜːθ/', wordOrder: 2 },
      { type: 'text', value: ' 已经发生，他必须准备下一次 ' },
      { type: 'targetWord', word: 'trial', definitionCn: '试炼', phonetic: '/ˈtraɪəl/', wordOrder: 3 },
      { type: 'text', value: '。' },
    ],
  }],
}

test('accepts a valid lesson document', () => {
  const result = validateLessonDocument(valid, { maxTargetWords: 100 })
  assert.equal(result.ok, true)
})


test('rejects English narrative lesson fields while allowing target English words and IPA', () => {
  const invalid = structuredClone(valid)
  invalid.title = 'Story 01: Rebirth on Qing Mao Mountain'
  invalid.sourceSummary = 'Fang Yuan wakes up and confirms that rebirth has happened.'
  invalid.continuityNotes = 'The next lesson continues with the aptitude test.'
  invalid.paragraphs[0].sceneTitle = 'Waking up'
  invalid.paragraphs[0].segments[0].value = 'He returned to the dormitory and began planning.'
  invalid.paragraphs[0].segments[1].definitionCn = 'dormitory'

  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /Simplified Chinese|Chinese|中文|language/i)
})

test('rejects template commentary in story narration fields', () => {
  const invalid = structuredClone(valid)
  invalid.paragraphs[0].segments[0].value = '这一处把故事的重心稳稳托住，给下一步变化留下空间。'

  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /meta commentary|template language|template commentary/i)
})


test('rejects clustered target words without Chinese narrative between them', () => {
  const invalid = structuredClone(valid)
  invalid.paragraphs[0].segments = [
    { type: 'text', value: '方源醒来后迅速确认局势。' },
    { type: 'targetWord', word: 'advance', definitionCn: '前进', phonetic: '/ədˈvæns/', wordOrder: 1 },
    { type: 'targetWord', word: 'advanced', definitionCn: '先进的', phonetic: '/ədˈvænst/', wordOrder: 2 },
    { type: 'text', value: '他继续观察四周。' },
  ]
  invalid.paragraphs[1].segments = [{ type: 'text', value: '后续场景保留。' }]

  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /naturally embedded|between target words/)
})

test('rejects a lesson with more than 100 target words', () => {
  const tooLarge = structuredClone(valid)
  tooLarge.paragraphs[0].segments = Array.from({ length: 101 }, (_, index) => ({
    type: 'targetWord', word: `word-${index}`, definitionCn: '释义', phonetic: '/wɜːd/', wordOrder: index + 1,
  }))
  tooLarge.paragraphs[1].segments = [{ type: 'text', value: '后续场景保留。' }]
  const result = validateLessonDocument(tooLarge, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /100/)
})

test('rejects duplicate target-word order and empty glosses', () => {
  const invalid = structuredClone(valid)
  invalid.paragraphs[0].segments.push({
    type: 'targetWord', word: 'dorm', definitionCn: '', phonetic: '/dɔːm/', wordOrder: 1,
  })
  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /wordOrder|definitionCn/)
})


test('rejects target words with missing or blank phonetics', () => {
  const missing = structuredClone(valid)
  delete missing.paragraphs[0].segments[1].phonetic
  const blank = structuredClone(valid)
  blank.paragraphs[0].segments[1].phonetic = '   '

  for (const document of [missing, blank]) {
    const result = validateLessonDocument(document, { maxTargetWords: 100 })
    assert.equal(result.ok, false)
    assert.match(result.errors.join('\n'), /phonetic must be a non-empty string/)
  }
})

test('rejects template commentary in title, summary, and continuity fields', () => {
  const invalid = structuredClone(valid)
  invalid.title = '第1课：主线推进'
  invalid.sourceSummary = '本课围绕方源重生后继续推进布局。'
  invalid.continuityNotes = '这一层细节强化了冲突感，也让读者更清楚角色的判断。'

  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /title|sourceSummary|continuityNotes/)
})
