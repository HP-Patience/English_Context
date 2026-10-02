import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PRODUCTION_MIGRATION_ORDER,
  buildMigrationTransaction,
  checksumMigration,
  parseDatabaseUrl,
  runProductionMigrationSequence,
} from '../../deploy/apply-production-migrations.mjs'

test('production migration order bootstraps the admin before the credential constraint', () => {
  assert.deepEqual(PRODUCTION_MIGRATION_ORDER, [
    '20261002_multi_user_accounts',
    '20261002_multi_user_interactions',
    '20261002_require_account_credentials',
  ])
})

test('database URL becomes libpq environment without putting secrets in arguments', () => {
  const env = parseDatabaseUrl('postgresql://app%40user:p%40ss%3Aword@db.example:5433/context?sslmode=require&schema=public')
  assert.equal(env.PGHOST, 'db.example')
  assert.equal(env.PGPORT, '5433')
  assert.equal(env.PGUSER, 'app@user')
  assert.equal(env.PGPASSWORD, 'p@ss:word')
  assert.equal(env.PGDATABASE, 'context')
  assert.equal(env.PGSSLMODE, 'require')
  assert.equal(env.PGOPTIONS, '-c search_path=public')
})

test('rejects non-PostgreSQL and unsafe schema values', () => {
  assert.throws(() => parseDatabaseUrl('mysql://user:pass@localhost/db'))
  assert.throws(() => parseDatabaseUrl('postgresql://user:pass@localhost/db?schema=public%22%3Bdrop%20schema%20public'))
})

test('migration wrapper records the exact checksum in the same transaction', () => {
  const sql = 'CREATE TABLE example (id text);'
  const checksum = checksumMigration(Buffer.from(sql))
  const transaction = buildMigrationTransaction({ id: 'migration-id', checksum, name: 'migration-name', sql })
  assert.match(transaction, /^BEGIN;/)
  assert.match(transaction, /CREATE TABLE example/)
  assert.match(transaction, new RegExp(`'${checksum}'`))
  assert.match(transaction, /INSERT INTO "_prisma_migrations"/)
  assert.match(transaction, /COMMIT;$/)
})

test('prepare phase backfills the admin before interaction tables and leaves constraints pending', async () => {
  const events = []
  await runProductionMigrationSequence({
    phase: 'prepare',
    applyMigration: async (name) => events.push(`migration:${name}`),
    ensureAdmin: async ({ allowBootstrap }) => events.push(`ensure-admin:${allowBootstrap}`),
    credentialsAlreadyRequired: false,
  })
  assert.deepEqual(events, [
    'migration:20261002_multi_user_accounts',
    'ensure-admin:true',
    'migration:20261002_multi_user_interactions',
  ])
})

test('finalize phase applies strict credentials only after account initialization', async () => {
  const events = []
  await runProductionMigrationSequence({
    phase: 'finalize',
    applyMigration: async (name) => events.push(`migration:${name}`),
    ensureAdmin: async ({ allowBootstrap }) => events.push(`ensure-admin:${allowBootstrap}`),
    credentialsAlreadyRequired: false,
  })
  assert.deepEqual(events, [
    'migration:20261002_multi_user_accounts',
    'ensure-admin:true',
    'migration:20261002_multi_user_interactions',
    'migration:20261002_require_account_credentials',
  ])
})

test('finalize never bootstraps or overwrites credentials after constraints are applied', async () => {
  const events = []
  await runProductionMigrationSequence({
    phase: 'finalize',
    applyMigration: async (name) => events.push(`migration:${name}`),
    ensureAdmin: async ({ allowBootstrap }) => events.push(`ensure-admin:${allowBootstrap}`),
    credentialsAlreadyRequired: true,
  })
  assert.equal(events.includes('ensure-admin:false'), true)
  assert.equal(events.includes('migration:20261002_require_account_credentials'), true)
})
