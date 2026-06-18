import { neon } from '@neondatabase/serverless';
import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SQLITE_PATH = 'prisma/dev.db';
const CACHE_DIR = 'scripts/.migrate-cache';

// table insert order (dependency order)
const TABLES = [
  'Word',
  'Meaning',
  'WordGroup',
  'WordGroupItem',
  'User',
  'UserWord',
  'UserWordMeaning',
  'GeneratedSentence',
  'ReviewSession',
  'ReviewLog',
  'DailyGoal',
];

const BOOL_COLUMNS = new Set([
  'bookmarked', 'interestTuned', 'isSynonymTest', 'completed',
]);

function serializeValue(v, colName) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') {
    // Convert epoch ms timestamps to proper PG timestamps
    if (v > 1000000000000) return `'${new Date(v).toISOString()}'`;
    // Convert 0/1 booleans to PG true/false
    if (BOOL_COLUMNS.has(colName)) return v ? 'true' : 'false';
    return v;
  }
  // Escape single quotes: ' -> ''
  return `'${String(v).replace(/'/g, "''")}'`;
}

function dumpTable(name) {
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (existsSync(cacheFile)) {
    const data = JSON.parse(readFileSync(cacheFile, 'utf-8'));
    console.log(`  Cache hit: ${name} (${data.length} rows)`);
    return data;
  }

  // Use temp file to avoid ENOBUFS with large datasets
  const tmpFile = join(CACHE_DIR, `${name}.tmp.json`);
  const r = spawnSync('sqlite3', ['-json', SQLITE_PATH, `SELECT * FROM "${name}"`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 500 * 1024 * 1024, // 500MB
    encoding: 'utf-8',
  });
  if (r.error && r.error.code === 'ENOBUFS') {
    // Fallback: write to file via shell
    execSync(`sqlite3 -json "${SQLITE_PATH}" "SELECT * FROM \\"${name}\\"" > "${tmpFile}"`, { shell: true });
    const rows = JSON.parse(readFileSync(tmpFile, 'utf-8'));
    writeFileSync(cacheFile, JSON.stringify(rows));
    try { execSync(`rm "${tmpFile}"`); } catch {}
    console.log(`  Dumped ${name}: ${rows.length} rows`);
    return rows;
  }
  const rows = JSON.parse(r.stdout);
  writeFileSync(cacheFile, JSON.stringify(rows));
  console.log(`  Dumped ${name}: ${rows.length} rows`);
  return rows;
}

async function migrate() {
  if (!existsSync(SQLITE_PATH)) {
    console.error(`SQLite DB not found at ${SQLITE_PATH}`);
    process.exit(1);
  }

  // Create cache dir
  if (!existsSync(CACHE_DIR)) {
    execSync(`mkdir -p "${CACHE_DIR}"`);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  // Dump all tables
  console.log('Dumping SQLite data...');
  const allData = {};
  for (const name of TABLES) {
    allData[name] = dumpTable(name);
  }

  // Use sql.query for raw SQL execution (tagged template params not suitable for dynamic SQL)
  const exec = async (text) => await sql.query(text);

  // Clear existing data in reverse order
  console.log('\nClearing existing data...');
  for (let i = TABLES.length - 1; i >= 0; i--) {
    await exec(`DELETE FROM "${TABLES[i]}"`);
    console.log(`  Cleared ${TABLES[i]}`);
  }

  // Insert data in dependency order, 100 rows per batch
  console.log('\nInserting data into Neon...');
  for (const name of TABLES) {
    const rows = allData[name];
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    const colList = columns.map(c => `"${c}"`).join(', ');
    const batchSize = 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = batch.map(row =>
        `(${columns.map(c => serializeValue(row[c], c)).join(', ')})`
      ).join(', ');

      await exec(`INSERT INTO "${name}" (${colList}) VALUES ${values}`);
    }

    console.log(`  Inserted ${name}: ${rows.length} rows`);
  }

  console.log('\nMigration complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
