/**
 * Clean up bad GeneratedSentence records where sentence text doesn't contain the target word.
 *
 * Usage:
 *   node scripts/cleanup-sentences.js            # dry-run (just report)
 *   node scripts/cleanup-sentences.js --execute   # actually delete bad records
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes('--execute')

function sentenceContainsWord(sentence, word) {
  const clean = sentence.replace(/\*\*(.*?)\*\*/g, '$1')
  return clean.toLowerCase().includes(word.toLowerCase())
}

async function main() {
  const sentences = await prisma.generatedSentence.findMany({
    include: {
      meaning: {
        include: { word: true }
      }
    }
  })

  const bad = []

  for (const s of sentences) {
    const wordText = s.meaning.word.text
    if (!sentenceContainsWord(s.sentenceText, wordText)) {
      bad.push({
        id: s.id,
        word: wordText,
        sentence: s.sentenceText.slice(0, 80),
        meaning: s.meaning.definition,
        source: s.source,
      })
    }
  }

  console.log(`\nTotal GeneratedSentence records: ${sentences.length}`)
  console.log(`Bad records (sentence missing target word): ${bad.length}\n`)

  if (bad.length === 0) {
    console.log('No bad data found.')
    return
  }

  for (const b of bad) {
    console.log(`  [${b.source}] word="${b.word}" meaning="${b.meaning}"`)
    console.log(`    sentence: ${b.sentence}`)
    console.log()
  }

  if (DRY_RUN) {
    console.log(`DRY RUN. ${bad.length} records would be deleted.`)
    console.log('Run with --execute to delete them.')
  } else {
    const ids = bad.map(b => b.id)
    const deleted = await prisma.generatedSentence.deleteMany({
      where: { id: { in: ids } }
    })
    console.log(`Deleted ${deleted.count} bad sentences.`)

    // Also find and clean up Meanings that now have zero sentences and look suspicious
    const orphanMeanings = await prisma.meaning.findMany({
      where: {
        generatedSentences: { none: {} },
        example: null,
      },
      include: { word: true }
    })

    if (orphanMeanings.length > 0) {
      console.log(`\nOrphan meanings (no sentences left, no example): ${orphanMeanings.length}`)
      for (const m of orphanMeanings) {
        console.log(`  word="${m.word.text}" pos=${m.partOfSpeech} def="${m.definition}"`)
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
