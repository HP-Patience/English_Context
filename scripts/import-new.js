/**
 * Clear ALL data and import from 2026考研英语词汇闪过.txt
 * Format: #CategoryName + word list
 * Run: node scripts/import-new.js
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || 'local-user'

async function main() {
  console.log('=== Step 1: Clear all existing data ===')

  // Delete in FK-safe order
  await prisma.reviewLog.deleteMany()
  await prisma.reviewSession.deleteMany()
  await prisma.generatedSentence.deleteMany()
  await prisma.userWordMeaning.deleteMany()
  await prisma.userWord.deleteMany()
  await prisma.meaning.deleteMany()
  await prisma.wordGroupItem.deleteMany()
  await prisma.wordGroup.deleteMany()
  await prisma.word.deleteMany()
  console.log('All data cleared.')

  // Ensure local user exists
  await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, email: 'local@contextvocab.app', name: 'Local User' },
  })

  console.log('\n=== Step 2: Parse txt file ===')

  const txtPath = path.join(__dirname, '..', 'data', '2026考研英语词汇闪过.txt')
  const raw = fs.readFileSync(txtPath, 'utf-8')
  const lines = raw.split('\n').filter(l => l.trim())

  // Parse sections
  const sections = []
  let currentSection = null
  for (const line of lines) {
    if (line.startsWith('#')) {
      currentSection = { name: line.substring(1).trim(), words: [] }
      sections.push(currentSection)
    } else if (currentSection) {
      currentSection.words.push(line.trim())
    }
  }

  console.log(`Found ${sections.length} sections, ${sections.reduce((s, sec) => s + sec.words.length, 0)} total word occurrences`)

  // Collect unique words
  const allWordTexts = [...new Set(sections.flatMap(s => s.words))]
  console.log(`Unique words: ${allWordTexts.length}`)

  console.log('\n=== Step 3: Create Word records ===')

  // Batch create all words
  for (let i = 0; i < allWordTexts.length; i++) {
    await prisma.word.create({
      data: { text: allWordTexts[i], language: 'en' },
    })
    if ((i + 1) % 1000 === 0) console.log(`  ${i + 1}/${allWordTexts.length} words`)
  }
  console.log(`  ${allWordTexts.length} words created.`)

  // Also create UserWord records for all words (no meanings yet)
  const allWords = await prisma.word.findMany()
  const wordMap = new Map(allWords.map(w => [w.text, w]))

  for (let i = 0; i < allWords.length; i++) {
    await prisma.userWord.create({
      data: { userId: LOCAL_USER_ID, wordId: allWords[i].id, status: 'learning', mastery: 0 },
    })
    if ((i + 1) % 1000 === 0) console.log(`  userWords: ${i + 1}/${allWords.length}`)
  }
  console.log(`  ${allWords.length} userWords created.`)

  console.log('\n=== Step 4: Create WordGroup + WordGroupItem records ===')

  let sortOrder = 0
  for (const section of sections) {
    const group = await prisma.wordGroup.create({
      data: { name: section.name, sortOrder },
    })

    for (let i = 0; i < section.words.length; i++) {
      const word = wordMap.get(section.words[i])
      if (!word) {
        console.warn(`  Warning: word "${section.words[i]}" not found in DB`)
        continue
      }
      await prisma.wordGroupItem.create({
        data: { wordGroupId: group.id, wordId: word.id, sortOrder: i },
      })
    }
    sortOrder++
  }

  console.log(`  ${sections.length} groups created.`)

  // Stats
  const wordCount = await prisma.word.count()
  const uwCount = await prisma.userWord.count()
  const giCount = await prisma.wordGroupItem.count()
  console.log(`\n=== Done ===`)
  console.log(`Words: ${wordCount}`)
  console.log(`UserWords: ${uwCount}`)
  console.log(`GroupItems: ${giCount}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
