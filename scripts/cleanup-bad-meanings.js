const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

function isBadMeaningWhere() {
  return {
    example: null,
    generatedSentences: {
      none: {
        source: { not: 'synonym_test' },
      },
    },
  }
}

async function main() {
  const badMeanings = await prisma.meaning.findMany({
    where: isBadMeaningWhere(),
    select: {
      id: true,
      wordId: true,
      partOfSpeech: true,
      definitionCn: true,
      word: { select: { text: true } },
    },
    orderBy: { id: 'asc' },
  })

  const badMeaningIds = badMeanings.map((m) => m.id)

  const counts = await prisma.$queryRawUnsafe(`
    WITH bad_meanings AS (
      SELECT m.id
      FROM "Meaning" m
      WHERE m."example" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "GeneratedSentence" gs
          WHERE gs."meaningId" = m.id
            AND gs."source" <> 'synonym_test'
        )
    )
    SELECT
      (SELECT COUNT(*)::int FROM bad_meanings) AS meanings,
      (SELECT COUNT(*)::int FROM "UserWordMeaning" uwm JOIN bad_meanings bm ON bm.id = uwm."meaningId") AS user_word_meanings,
      (SELECT COUNT(*)::int FROM "ReviewLog" rl JOIN "UserWordMeaning" uwm ON uwm.id = rl."userWordMeaningId" JOIN bad_meanings bm ON bm.id = uwm."meaningId") AS review_logs,
      (SELECT COUNT(*)::int FROM "GeneratedSentence" gs JOIN bad_meanings bm ON bm.id = gs."meaningId") AS generated_sentences,
      (SELECT COUNT(*)::int FROM "StoryLessonWord" slw JOIN bad_meanings bm ON bm.id = slw."meaningId") AS story_lesson_words,
      (SELECT COUNT(*)::int FROM "StoryReviewAttempt" sra JOIN "StoryLessonWord" slw ON slw.id = sra."lessonWordId" JOIN bad_meanings bm ON bm.id = slw."meaningId") AS story_review_attempts
  `)

  console.log('Bad meaning cleanup preview:')
  console.log(JSON.stringify(counts, null, 2))
  console.log('Sample meanings:')
  for (const m of badMeanings.slice(0, 20)) {
    console.log(`- ${m.word.text} :: ${m.partOfSpeech} :: ${m.definitionCn ?? ''}`)
  }

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to delete these records.')
    return
  }

  const badUwmIds = await prisma.userWordMeaning.findMany({
    where: { meaningId: { in: badMeaningIds } },
    select: { id: true },
  }).then((rows) => rows.map((row) => row.id))

  const badStoryLessonWordIds = await prisma.storyLessonWord.findMany({
    where: { meaningId: { in: badMeaningIds } },
    select: { id: true },
  }).then((rows) => rows.map((row) => row.id))

  const badGeneratedSentenceIds = await prisma.generatedSentence.findMany({
    where: { meaningId: { in: badMeaningIds } },
    select: { id: true },
  }).then((rows) => rows.map((row) => row.id))

  await prisma.$transaction(async (tx) => {
    if (badStoryLessonWordIds.length > 0) {
      await tx.storyReviewAttempt.deleteMany({
        where: { lessonWordId: { in: badStoryLessonWordIds } },
      })
    }

    if (badUwmIds.length > 0) {
      await tx.reviewLog.deleteMany({
        where: { userWordMeaningId: { in: badUwmIds } },
      })
    }

    if (badGeneratedSentenceIds.length > 0) {
      await tx.generatedSentence.deleteMany({
        where: { id: { in: badGeneratedSentenceIds } },
      })
    }

    if (badUwmIds.length > 0) {
      await tx.userWordMeaning.deleteMany({
        where: { id: { in: badUwmIds } },
      })
    }

    if (badStoryLessonWordIds.length > 0) {
      await tx.storyLessonWord.deleteMany({
        where: { id: { in: badStoryLessonWordIds } },
      })
    }

    await tx.meaning.deleteMany({
      where: { id: { in: badMeaningIds } },
    })
  })

  const remaining = await prisma.meaning.count({ where: isBadMeaningWhere() })
  console.log(`\nDeleted ${badMeaningIds.length} meanings.`)
  console.log(`Remaining bad meanings: ${remaining}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
