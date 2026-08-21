/* eslint-disable @typescript-eslint/no-require-imports */

const { destructiveVocabularyReset } = require('./destructive-vocabulary-reset')
const { collectUniqueWords, parseWordImport } = require('./word-import')

async function importVocabularyData({
  prisma,
  userId,
  raw,
  reset = destructiveVocabularyReset,
  logger = console,
}) {
  logger.log('=== Step 1: Clear all existing data ===')
  await reset(prisma)
  logger.log('All data cleared.')

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: 'local@contextvocab.app', name: 'Local User' },
  })

  logger.log('\n=== Step 2: Parse txt file ===')
  const sections = parseWordImport(raw)
  logger.log(`Found ${sections.length} sections, ${sections.reduce((sum, section) => sum + section.words.length, 0)} total word occurrences`)

  const importedWords = collectUniqueWords(sections)
  logger.log(`Unique words: ${importedWords.length}`)

  logger.log('\n=== Step 3: Create Word records ===')
  for (let index = 0; index < importedWords.length; index += 1) {
    await prisma.word.create({
      data: { text: importedWords[index].text, phonetic: importedWords[index].phonetic, language: 'en' },
    })
    if ((index + 1) % 1000 === 0) logger.log(`  ${index + 1}/${importedWords.length} words`)
  }
  logger.log(`  ${importedWords.length} words created.`)

  const allWords = await prisma.word.findMany()
  const wordMap = new Map(allWords.map((word) => [word.text, word]))

  for (let index = 0; index < allWords.length; index += 1) {
    await prisma.userWord.create({
      data: { userId, wordId: allWords[index].id, status: 'learning', mastery: 0 },
    })
    if ((index + 1) % 1000 === 0) logger.log(`  userWords: ${index + 1}/${allWords.length}`)
  }
  logger.log(`  ${allWords.length} userWords created.`)

  logger.log('\n=== Step 4: Create WordGroup + WordGroupItem records ===')
  for (let sortOrder = 0; sortOrder < sections.length; sortOrder += 1) {
    const section = sections[sortOrder]
    const group = await prisma.wordGroup.create({
      data: { name: section.name, sortOrder },
    })

    for (let index = 0; index < section.words.length; index += 1) {
      const word = wordMap.get(section.words[index].text)
      if (!word) {
        logger.warn(`  Warning: word "${section.words[index].text}" not found in DB`)
        continue
      }
      await prisma.wordGroupItem.create({
        data: { wordGroupId: group.id, wordId: word.id, sortOrder: index },
      })
    }
  }
  logger.log(`  ${sections.length} groups created.`)

  const wordCount = await prisma.word.count()
  const userWordCount = await prisma.userWord.count()
  const groupItemCount = await prisma.wordGroupItem.count()
  logger.log('\n=== Done ===')
  logger.log(`Words: ${wordCount}`)
  logger.log(`UserWords: ${userWordCount}`)
  logger.log(`GroupItems: ${groupItemCount}`)

  return { wordCount, userWordCount, groupItemCount }
}

module.exports = { importVocabularyData }
