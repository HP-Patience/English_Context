/**
 * AI-generate meanings + sentences for ALL words.
 * Run: node scripts/generate-meanings.js
 */
const { PrismaClient } = require('@prisma/client')
const OpenAI = require('openai')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || 'local-user'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
})

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required')
}

const BATCH_SIZE = 15
const CONCURRENCY = 5

function buildPrompt(words) {
  return `You are generating English vocabulary data for Chinese students (考研).

For EACH word below, return JSON array "results":
{ "word": "exact word text", "partOfSpeech": "noun|verb|adjective|adverb|etc", "definitionCn": "简短中文释义(2-10字)", "sentence": "English sentence with **word** wrapped in ** **", "sentenceCn": "中文翻译" }

RULES:
- One entry per meaning: if word has MULTIPLE meanings (e.g. both noun and verb), return MULTIPLE entries
- Sentence must clearly demonstrate the meaning
- Difficulty: postgraduate exam level
- Output ONLY valid JSON

Words:
${words.map((w, i) => `${i}. ${w.text}`).join('\n')}`
}

async function run() {
  const words = await prisma.word.findMany({
    where: { meanings: { none: {} } },
    orderBy: { text: 'asc' },
  })
  console.log(`Total words to generate: ${words.length}`)
  if (words.length === 0) { console.log('All done!'); return }

  const totalBatches = Math.ceil(words.length / BATCH_SIZE)
  console.log(`Batches: ${totalBatches} (${BATCH_SIZE} words each, concurrency ${CONCURRENCY})`)

  const progressPath = path.join(__dirname, '..', 'data', 'generation-progress.json')
  let startFrom = 0
  if (fs.existsSync(progressPath)) {
    startFrom = JSON.parse(fs.readFileSync(progressPath, 'utf-8')).lastBatch || 0
    console.log(`Resuming from batch ${startFrom}`)
  }

  let totalMeanings = 0

  for (let i = startFrom; i < totalBatches; i += CONCURRENCY) {
    const batch = []
    for (let c = 0; c < CONCURRENCY && i + c < totalBatches; c++) {
      const slice = words.slice((i + c) * BATCH_SIZE, (i + c + 1) * BATCH_SIZE)
      batch.push(processBatch(i + c + 1, totalBatches, slice))
    }
    const results = await Promise.all(batch)
    totalMeanings += results.reduce((s, r) => s + r, 0)

    fs.writeFileSync(progressPath, JSON.stringify({ lastBatch: i + CONCURRENCY }), 'utf-8')
  }

  const remaining = await prisma.word.count({ where: { meanings: { none: {} } } })
  console.log(`\nDone! Total meanings: ${totalMeanings}, Remaining: ${remaining}`)
}

async function processBatch(batchNum, totalBatches, batchWords) {
  const wordTexts = batchWords.map(w => w.text)
  const prompt = buildPrompt(batchWords)
  process.stdout.write(`[${batchNum}/${totalBatches}] `)

  try {
    const res = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 16384,
    })

    let content = res.choices[0]?.message?.content
    if (!content) { console.log(`empty`); return 0 }

    // Strip thinking/reasoning content
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '')
    // Find first complete JSON object (handle multiple objects)
    const start = content.indexOf('{')
    if (start === -1) { console.log(`no json`); return 0 }
    let depth = 0, end = -1
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++
      else if (content[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) { console.log(`unbalanced json`); return 0 }
    content = content.slice(start, end + 1)

    const parsed = JSON.parse(content)
    const entries = parsed.results || parsed.entries || (Array.isArray(parsed) ? parsed : [])

    if (!Array.isArray(entries) || entries.length === 0) {
      console.log(`no data`)
      return 0
    }

    let created = 0
    for (const entry of entries) {
      const wordText = entry.word || entry.text
      if (!wordText || !entry.definitionCn) continue

      const word = await prisma.word.findFirst({ where: { text: wordText, language: 'en' } })
      if (!word) continue

      const uw = await prisma.userWord.findFirst({ where: { userId: LOCAL_USER_ID, wordId: word.id } })
      if (!uw) continue

      const meaning = await prisma.meaning.create({
        data: {
          wordId: word.id,
          partOfSpeech: entry.partOfSpeech || 'unknown',
          definition: entry.definitionCn,
          definitionCn: entry.definitionCn,
        },
      })
      const uwm = await prisma.userWordMeaning.create({
        data: { userWordId: uw.id, meaningId: meaning.id, easeFactor: 2.5, interval: 0, nextReviewAt: new Date(), mastery: 0 },
      })
      if (entry.sentence) {
        await prisma.generatedSentence.create({
          data: { userWordMeaningId: uwm.id, meaningId: meaning.id, sentenceText: entry.sentence, sentenceCn: entry.sentenceCn || null, contextTopic: 'general', interestTuned: false, source: 'batch-ai' },
        })
      }
      created++
    }

    console.log(`${created}/${batchWords.length} words`)
    return created
  } catch (err) {
    console.log(`error: ${err.message.substring(0, 80)}`)
    return 0
  }
}

run().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
