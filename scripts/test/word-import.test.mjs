import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { collectUniqueWords, parseWordImport } = require('../lib/word-import.js')

test('parses the current bare-word source without inventing phonetics', () => {
  const result = parseWordImport('#高频词 Word List 1\nadvance\nadvanced\n')

  assert.deepEqual(result, [
    {
      name: '高频词 Word List 1',
      words: [
        { text: 'advance', phonetic: null },
        { text: 'advanced', phonetic: null },
      ],
    },
  ])
})

test('preserves an explicitly supplied tab-delimited phonetic value', () => {
  const result = parseWordImport('#高频词 Word List 1\nadvance\t/ədˈvɑːns/\nlegacy\t\n')

  assert.deepEqual(result[0].words, [
    { text: 'advance', phonetic: '/ədˈvɑːns/' },
    { text: 'legacy', phonetic: null },
  ])
})

test('rejects malformed rows and conflicting persisted phonetics instead of guessing', () => {
  assert.throws(() => parseWordImport('advance'), /before a section/i)
  assert.throws(() => parseWordImport('#Group\nadvance\t/a/\textra'), /malformed/i)
  assert.throws(() => collectUniqueWords([
    { name: 'One', words: [{ text: 'advance', phonetic: '/a/' }] },
    { name: 'Two', words: [{ text: 'advance', phonetic: '/b/' }] },
  ]), /conflicting phonetics/i)
})

test('deduplicates words while retaining a real phonetic from any source occurrence', () => {
  assert.deepEqual(collectUniqueWords([
    { name: 'One', words: [{ text: 'advance', phonetic: null }] },
    { name: 'Two', words: [{ text: 'advance', phonetic: '/ədˈvɑːns/' }] },
  ]), [{ text: 'advance', phonetic: '/ədˈvɑːns/' }])
})
