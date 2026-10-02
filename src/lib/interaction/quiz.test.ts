import { describe, expect, it } from 'vitest'

import { validateQuizAnswers, validateQuizWordIds } from './quiz'

describe('quiz validation', () => {
  it('keeps answer validation independent from formal review scheduling', () => {
    expect(validateQuizWordIds(['word-1'])).toEqual(['word-1'])
    expect(validateQuizAnswers([{ wordId: 'word-1', remembered: false }])).toEqual([
      { wordId: 'word-1', remembered: false },
    ])
  })
})
