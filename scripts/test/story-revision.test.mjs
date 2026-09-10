import test from 'node:test'
import assert from 'node:assert/strict'
import { renderStoryParagraph, storyParagraphHash, reviseStoryParagraph, validateStoryMeaningBindings } from '../lib/story-revision.mjs'

const target = { type: 'targetWord', word: 'bear', definitionCn: '熊', phonetic: '/beə/', wordOrder: 1 }
const paragraph = { sceneTitle: '险境', segments: [{ type: 'text', value: '他只能' }, target, { type: 'text', value: '住血气压迫。' }] }
const before = renderStoryParagraph(paragraph)
const edit = { before, beforeSha256: storyParagraphHash(before), after: '血气压来，他仿佛被一头巨大的【bear=熊】按住，几乎无法呼吸。' }
const row = { wordId: 'w1', meaningId: 'm1', sortOrder: 1, glossCn: '熊', word: { id: 'w1', text: 'bear' }, meaning: { id: 'm1', wordId: 'w1', definitionCn: '熊' } }

test('exact repair preserves target metadata and does not mutate source', () => {
  const result = reviseStoryParagraph(paragraph, edit)
  assert.equal(renderStoryParagraph(result), edit.after)
  assert.deepEqual(result.segments.find(s => s.type === 'targetWord'), target)
  assert.equal(renderStoryParagraph(paragraph), before)
  assert.equal(result.sceneTitle, paragraph.sceneTitle)
})

test('repair is idempotent, including when replacement contains old text', () => {
  const first = reviseStoryParagraph(paragraph, edit)
  assert.deepEqual(reviseStoryParagraph(first, edit), first)
  const prefixEdit = { ...edit, after: '危险逼近。' + before }
  const prefixed = reviseStoryParagraph(paragraph, prefixEdit)
  assert.deepEqual(reviseStoryParagraph(prefixed, prefixEdit), prefixed)
})

test('reject stale source and tampered before hash', () => {
  assert.throws(() => reviseStoryParagraph({ ...paragraph, segments: [{type: 'text', value: '不同正文'}, target] }, edit), /Stale/)
  assert.throws(() => reviseStoryParagraph(paragraph, { ...edit, beforeSha256: 'invalid' }), /hash/)
})

test('reject word changes, sense changes, target removal/addition and malformed markers', () => {
  for (const after of ['【bear=承受】', '【bare=熊】', '熊', edit.after + '【bear=熊】', edit.after + '【坏标记']) {
    assert.throws(() => reviseStoryParagraph(paragraph, { ...edit, after }), /marker/i)
  }
})

test('reject reordered markers', () => {
  const other = { ...target, word: 'panel', definitionCn: '专家小组', wordOrder: 2 }
  const p = { ...paragraph, segments: [target, {type: 'text', value: '在众人面前等候'}, other] }
  const text = renderStoryParagraph(p)
  assert.throws(() => reviseStoryParagraph(p, { before: text, beforeSha256: storyParagraphHash(text), after: '【panel=专家小组】在众人面前等候【bear=熊】' }), /preserve/)
})

test('validate IDs, word, gloss, selected database sense and count', () => {
  const doc = { paragraphs: [reviseStoryParagraph(paragraph, edit)] }
  assert.equal(validateStoryMeaningBindings(doc, [row]).ok, true)
  for (const bad of [{ ...row, meaningId: 'wrong' }, { ...row, glossCn: '承受' }, { ...row, meaning: { ...row.meaning, definitionCn: '承受' } }, { ...row, meaning: { ...row.meaning, wordId: 'other' } }, { ...row, word: { ...row.word, text: 'bare' } }, { ...row, sortOrder: 2 }]) {
    assert.equal(validateStoryMeaningBindings(doc, [bad]).ok, false)
  }
  assert.equal(validateStoryMeaningBindings(doc, []).ok, false)
  assert.equal(validateStoryMeaningBindings(doc, [row, row]).ok, false)
})
