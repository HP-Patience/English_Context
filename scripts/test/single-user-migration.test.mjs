import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeBootstrapAccount } from '../../scripts/migrate-single-user-to-admin.mjs'

test('bootstrap account normalizes the configured username and preserves the hash', () => {
  assert.deepEqual(
    normalizeBootstrapAccount({
      userId: 'local-user',
      username: 'Owner',
      passwordHash: 'scrypt:private',
    }),
    {
      id: 'local-user',
      username: 'owner',
      passwordHash: 'scrypt:private',
      role: 'admin',
      status: 'active',
      statsSharingEnabled: true,
    },
  )
})

test('bootstrap account rejects missing credentials', () => {
  assert.throws(() => normalizeBootstrapAccount({
    userId: 'local-user',
    username: '',
    passwordHash: '',
  }))
})
