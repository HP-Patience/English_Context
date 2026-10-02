import { describe, expect, it } from 'vitest'

import { validateMessageInput } from './message'
import { validateQuizAnswers, validateQuizWordIds } from './quiz'

describe('interaction message validation', () => {
  it('accepts text and allowlisted encouragements', () => {
    expect(validateMessageInput({ body: '你好', kind: 'text' })).toEqual({ body: '你好', kind: 'text' })
    expect(validateMessageInput({ body: '加油！', kind: 'encouragement' })).toEqual({ body: '加油！', kind: 'encouragement' })
  })

  it('rejects empty or unsupported messages', () => {
    expect(() => validateMessageInput({ body: '', kind: 'text' })).toThrow()
    expect(() => validateMessageInput({ body: 'hello', kind: 'system' })).toThrow()
  })
})

describe('interaction quiz validation', () => {
  it('requires one to ten unique words and boolean answers', () => {
    expect(validateQuizWordIds(['w1', 'w2'])).toEqual(['w1', 'w2'])
    expect(() => validateQuizWordIds([])).toThrow()
    expect(() => validateQuizWordIds(['w1', 'w1'])).toThrow()
    expect(() => validateQuizWordIds(Array.from({ length: 11 }, (_, i) => `w${i}`))).toThrow()
    expect(validateQuizAnswers([{ wordId: 'w1', remembered: true }])).toEqual([{ wordId: 'w1', remembered: true }])
    expect(() => validateQuizAnswers([{ wordId: 'w1', remembered: 'yes' as never }])).toThrow()
  })
})
