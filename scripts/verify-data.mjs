import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const tables = ['Word','Meaning','WordGroup','WordGroupItem','User','UserWord','UserWordMeaning','GeneratedSentence','ReviewSession','ReviewLog','DailyGoal'];
for (const t of tables) {
  const r = await sql.query(`SELECT COUNT(*) as cnt FROM "${t}"`);
  console.log(`${t}: ${r[0].cnt} rows`);
}
const u = await sql.query('SELECT name, email FROM "User"');
console.log('User:', JSON.stringify(u));
const w = await sql.query('SELECT text FROM "Word" LIMIT 5');
console.log('Sample words:', JSON.stringify(w.map(x => x.text)));
