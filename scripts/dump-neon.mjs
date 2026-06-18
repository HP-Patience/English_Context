// Dump ALL Neon data to SQL for local restore
// Usage: node scripts/dump-neon.mjs | PGPASSWORD=local E:/PostgreSQL/16/bin/psql -U postgres -d english_context
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envLocal = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
const neonUrl = envLocal.split('\n').find(l => l.startsWith('POSTGRES_PRISMA_URL='))
  ?.split('=').slice(1).join('=').replace(/^"|"$/g, '')

if (!neonUrl) { console.error('POSTGRES_PRISMA_URL not found'); process.exit(1) }

const sql = neon(neonUrl)

const TABLES = [
  'Word', 'Meaning', 'WordGroup', 'WordGroupItem',
  'User', 'UserWord', 'UserWordMeaning', 'GeneratedSentence',
  'ReviewSession', 'ReviewLog', 'DailyGoal',
]

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return `'${v.toISOString()}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

async function main() {
  // Truncate all tables in reverse order
  for (let i = TABLES.length - 1; i >= 0; i--) {
    console.log(`TRUNCATE "${TABLES[i]}" CASCADE;`)
  }

  for (const table of TABLES) {
    const rows = await sql.query(`SELECT * FROM "${table}"`)
    if (rows.length === 0) { process.stderr.write(`-- ${table}: 0 rows\n`); continue }
    process.stderr.write(`-- ${table}: ${rows.length} rows\n`)

    const columns = Object.keys(rows[0])
    const colList = columns.map(c => `"${c}"`).join(', ')

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const values = batch.map(row =>
        `(${columns.map(c => esc(row[c])).join(', ')})`
      ).join(',\n')
      console.log(`INSERT INTO "${table}" (${colList}) VALUES ${values};`)
    }
  }
}

main().catch(e => { process.stderr.write(e.stack + '\n'); process.exit(1) })
