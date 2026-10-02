import { describe, expect, it } from 'vitest'

import { normalizeManagedUserInput } from './users'

describe('managed user input', () => {
  it('normalizes usernames and trims display names', () => {
    expect(normalizeManagedUserInput({ username: ' Friend ', name: '  Friend  ', password: 'password-123' })).toEqual({
      username: 'friend',
      name: 'Friend',
      password: 'password-123',
    })
  })

  it('rejects invalid account values', () => {
    expect(() => normalizeManagedUserInput({ username: '', name: 'Friend', password: 'password-123' })).toThrow()
    expect(() => normalizeManagedUserInput({ username: 'friend', name: '', password: 'password-123' })).toThrow()
    expect(() => normalizeManagedUserInput({ username: 'friend', name: 'Friend', password: 'short' })).toThrow()
  })
})
