// Sync local progress BACK to Neon (Vercel production).
// Usage: node scripts/sync-to-neon.mjs
import { neon } from '@neondatabase/serverless'
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envLocal = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
const neonUrl = envLocal.split('\n').find(l => l.startsWith('POSTGRES_PRISMA_URL='))
  ?.split('=').slice(1).join('=').replace(/^"|"$/g, '')

if (!neonUrl) { console.error('POSTGRES_PRISMA_URL not found'); process.exit(1) }

const PSQL = 'E:/PostgreSQL/16/bin/psql'
const PSQL_ARGS = ['-U', 'postgres', '-d', 'english_context', '-At']
const ENV = { ...process.env, PGPASSWORD: 'local' }

const TABLES = ['UserWord', 'UserWordMeaning', 'ReviewLog', 'DailyGoal']

/** Run psql with args, return stdout. Uses spawnSync (no shell). */
function runPsql(sql) {
  const r = spawnSync(PSQL, [...PSQL_ARGS, '-c', sql], { env: ENV, encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`psql exited ${r.status}: ${r.stderr}`)
  return r.stdout
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function buildUpsert(table, columns, conflictCols) {
  const colList = columns.map(c => `"${c}"`).join(', ')
  const updateSet = columns
    .filter(c => !conflictCols.includes(c))
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ')
  return (values) => `INSERT INTO "${table}" (${colList}) VALUES ${values} ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO UPDATE SET ${updateSet};`
}

const CONFLICT_KEYS = {
  UserWord: ['userId', 'wordId'],
  UserWordMeaning: ['id'],
  ReviewLog: ['id'],
  DailyGoal: ['userId', 'date'],
}

async function main() {
  const remote = neon(neonUrl)

  for (const table of TABLES) {
    process.stderr.write(`\n--- ${table} ---\n`)

    // List columns from local
    const colRaw = runPsql(`SELECT column_name FROM information_schema.columns WHERE table_name='${table}' ORDER BY ordinal_position`)
    const columns = colRaw.trim().split('\n').filter(Boolean).map(c => c.trim())
    if (columns.length === 0) { process.stderr.write('  No columns\n'); continue }

    const conflictCols = CONFLICT_KEYS[table]

    // Read all rows as JSON array
    const colList = columns.map(c => `"${c}"`).join(', ')
    const raw = runPsql(`SELECT json_agg(row_to_json(t)) FROM (SELECT ${colList} FROM "${table}") t`).trim()
    if (!raw || raw === 'NULL') { process.stderr.write('  0 rows\n'); continue }
    const rows = JSON.parse(raw)
    if (!rows || rows.length === 0) { process.stderr.write('  0 rows\n'); continue }
    process.stderr.write(`  ${rows.length} rows\n`)

    // For DailyGoal: delete-and-insert to avoid PK conflicts
    if (table === 'DailyGoal') {
      await remote.query(`DELETE FROM "${table}"`)
    }

    // Batch upsert
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const values = batch.map(row =>
        `(${columns.map(c => esc(row[c])).join(', ')})`
      ).join(', ')

      if (table === 'DailyGoal') {
        await remote.query(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${values}`)
      } else {
        const upsert = buildUpsert(table, columns, conflictCols)
        await remote.query(upsert(values))
      }
    }
    process.stderr.write(`  Done\n`)
  }

  console.log('Sync to Neon complete!')
}

main().catch(e => { process.stderr.write(e.stack + '\n'); process.exit(1) })
