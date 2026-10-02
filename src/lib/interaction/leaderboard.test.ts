import { describe, expect, it } from 'vitest'

import { isAllowedInteractionPair } from './relationship'
import { rankEntries, startOfWeek } from './leaderboard'
import { validateChallengeInput } from './challenge'

describe('interaction relationships', () => {
  it('allows only admin and active ordinary-user pairs', () => {
    expect(isAllowedInteractionPair(
      { id: 'a', role: 'admin', status: 'active' },
      { id: 'u', role: 'user', status: 'active' },
    )).toBe(true)
    expect(isAllowedInteractionPair(
      { id: 'u1', role: 'user', status: 'active' },
      { id: 'u2', role: 'user', status: 'active' },
    )).toBe(false)
    expect(isAllowedInteractionPair(
      { id: 'a', role: 'admin', status: 'active' },
      { id: 'u', role: 'user', status: 'disabled' },
    )).toBe(false)
  })
})

describe('leaderboard helpers', () => {
  it('starts a week on Monday and ranks higher values first', () => {
    expect(startOfWeek(new Date('2026-10-02T12:00:00Z')).toISOString()).toBe('2026-09-28T00:00:00.000Z')
    expect(rankEntries([
      { userId: 'b', displayName: 'B', value: 2 },
      { userId: 'a', displayName: 'A', value: 5 },
    ])).toEqual([
      { rank: 1, userId: 'a', displayName: 'A', value: 5 },
      { rank: 2, userId: 'b', displayName: 'B', value: 2 },
    ])
  })
})

describe('challenge input', () => {
  it('accepts a bounded challenge and rejects invalid ranges', () => {
    expect(validateChallengeInput({
      title: '本周学习', kind: 'active_days', target: 5,
      startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-08T00:00:00.000Z',
    })).toMatchObject({ title: '本周学习', kind: 'active_days', target: 5 })
    expect(() => validateChallengeInput({
      title: '', kind: 'active_days', target: 0,
      startsAt: '2026-10-08T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z',
    })).toThrow()
  })
})
