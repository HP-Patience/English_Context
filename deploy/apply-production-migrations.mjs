import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
import { PrismaClient } from '@prisma/client'

import { migrateSingleUserToAdmin, normalizeBootstrapAccount } from '../scripts/migrate-single-user-to-admin.mjs'

export const PRODUCTION_MIGRATION_ORDER = [
  '20261002_multi_user_accounts',
  '20261002_multi_user_interactions',
  '20261002_require_account_credentials',
]

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const packagedMigrationRoot = resolve(scriptDirectory, 'prisma', 'migrations')
const migrationRoot = existsSync(packagedMigrationRoot)
  ? packagedMigrationRoot
  : resolve(scriptDirectory, '..', 'prisma', 'migrations')
const releaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function checksumMigration(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Production DATABASE_URL must use PostgreSQL.')
  }

  const schema = url.searchParams.get('schema') || 'public'
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error('Unsupported PostgreSQL schema name.')
  }

  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGOPTIONS: `-c search_path=${schema}`,
  }

  const pgOptions = [
    ['sslmode', 'PGSSLMODE'],
    ['sslrootcert', 'PGSSLROOTCERT'],
    ['sslcert', 'PGSSLCERT'],
    ['sslkey', 'PGSSLKEY'],
    ['sslcrl', 'PGSSLCRL'],
    ['channel_binding', 'PGCHANNELBINDING'],
    ['connect_timeout', 'PGCONNECT_TIMEOUT'],
  ]
  for (const [queryName, envName] of pgOptions) {
    const value = url.searchParams.get(queryName)
    if (value) env[envName] = value
  }

  if (!env.PGHOST || !env.PGUSER || !env.PGDATABASE) {
    throw new Error('Production DATABASE_URL is missing required connection fields.')
  }
  return env
}

export function buildMigrationTransaction({ id, checksum, name, sql }) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
  return [
    'BEGIN;',
    sql,
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") VALUES (${quote(id)}, ${quote(checksum)}, NOW(), ${quote(name)}, NULL, NULL, NOW(), 1);`,
    'COMMIT;',
  ].join('\n')
}

function runPsql(env, sql) {
  const result = spawnSync('psql', [
    '--no-psqlrc',
    '--no-align',
    '--tuples-only',
    '--set=ON_ERROR_STOP=1',
    '--command',
    sql,
  ], { env, encoding: 'utf8', maxBuffer: 1024 * 1024 })

  if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`PostgreSQL migration command failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function migrationStatus(env, name) {
  const sql = `SELECT "checksum" || '|' || COALESCE("finished_at" IS NOT NULL, false)::text || '|' || COALESCE("rolled_back_at" IS NOT NULL, false)::text FROM "_prisma_migrations" WHERE "migration_name" = '${name}' ORDER BY "started_at" DESC LIMIT 1;`
  const result = runPsql(env, sql)
  if (!result) return null
  const [checksum, finished, rolledBack] = result.split('|')
  return { checksum, finished: finished === 'true', rolledBack: rolledBack === 'true' }
}

async function applyMigration(env, name) {
  const path = resolve(migrationRoot, name, 'migration.sql')
  const contents = await readFile(path)
  const sql = contents.toString('utf8')
  const checksum = checksumMigration(contents)
  const status = migrationStatus(env, name)

  if (status?.finished && !status.rolledBack) {
    if (status.checksum !== checksum) {
      throw new Error(`Applied migration checksum mismatch: ${name}`)
    }
    console.log(`Migration already applied: ${name}`)
    return false
  }
  if (status && !status.finished && !status.rolledBack) {
    throw new Error(`Migration has an unresolved failed attempt: ${name}`)
  }
  if (status?.checksum && status.checksum !== checksum) {
    throw new Error(`Previously applied migration checksum mismatch: ${name}`)
  }

  try {
    runPsql(env, buildMigrationTransaction({
      id: randomUUID(),
      checksum,
      name,
      sql,
    }))
  } catch (error) {
    try {
      const committed = migrationStatus(env, name)
      if (committed?.finished && !committed.rolledBack && committed.checksum === checksum) {
        console.log(`Migration committed despite a lost client response: ${name}`)
        return true
      }
    } catch {
      // Preserve the original error; the deployment must stop if status cannot be verified.
    }
    throw error
  }
  console.log(`Applied migration: ${name}`)
  return true
}

export async function runProductionMigrationSequence({
  phase = 'prepare',
  applyMigration,
  ensureAdmin,
  credentialsAlreadyRequired,
}) {
  if (phase !== 'prepare' && phase !== 'finalize') throw new Error(`Unknown production migration phase: ${phase}`)

  await applyMigration(PRODUCTION_MIGRATION_ORDER[0])
  await ensureAdmin({ allowBootstrap: !credentialsAlreadyRequired })
  await applyMigration(PRODUCTION_MIGRATION_ORDER[1])
  if (phase === 'finalize') await applyMigration(PRODUCTION_MIGRATION_ORDER[2])
}

export async function applyProductionMigrations({ env = process.env, prisma, phase = 'prepare' } = {}) {
  const databaseEnv = parseDatabaseUrl(env.DATABASE_URL || '')
  const client = prisma ?? new PrismaClient()
  const ownsClient = !prisma

  try {
    const credentialsStatus = migrationStatus(databaseEnv, '20261002_require_account_credentials')
    const credentialsAlreadyRequired = Boolean(credentialsStatus?.finished && !credentialsStatus.rolledBack)
    await runProductionMigrationSequence({
      phase,
      applyMigration: (name) => applyMigration(databaseEnv, name),
      credentialsAlreadyRequired,
      ensureAdmin: async ({ allowBootstrap }) => {
        let adminCount = await client.user.count({ where: { role: 'admin', status: 'active' } })
        let nullCredentials = Number(await runPsql(databaseEnv,
          'SELECT COUNT(*) FROM "User" WHERE "username" IS NULL OR "passwordHash" IS NULL;'))

        if (adminCount !== 1 || nullCredentials !== 0) {
          if (!allowBootstrap) {
            throw new Error('Administrator account verification failed; refusing to continue the deployment.')
          }
          const bootstrapAccount = normalizeBootstrapAccount({
            userId: env.LOCAL_USER_ID || 'local-user',
            username: env.APP_AUTH_USERNAME,
            passwordHash: env.APP_AUTH_PASSWORD_HASH,
          })
          await migrateSingleUserToAdmin({ prisma: client, env: { ...env, APP_AUTH_USERNAME: bootstrapAccount.username } })
          adminCount = await client.user.count({ where: { role: 'admin', status: 'active' } })
          nullCredentials = Number(await runPsql(databaseEnv,
            'SELECT COUNT(*) FROM "User" WHERE "username" IS NULL OR "passwordHash" IS NULL;'))
          if (adminCount !== 1 || nullCredentials !== 0) {
            throw new Error('Administrator bootstrap verification failed; credential constraints were not applied.')
          }
          console.log('Existing single-user data is assigned to the administrator account.')
        } else {
          console.log('Administrator account is already initialized; credentials were not overwritten.')
        }
      },
    })
  } finally {
    if (ownsClient) await client.$disconnect()
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(releaseRoot)
  loadEnvConfig(releaseRoot, false)
  await applyProductionMigrations({ phase: process.argv.includes('--finalize') ? 'finalize' : 'prepare' })
}
