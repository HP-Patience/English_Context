const DESTRUCTIVE_VOCABULARY_RESET_ORDER = Object.freeze([
  'storyReviewAttempt',
  'userStoryWordProgress',
  'userStoryProgress',
  'storyLessonWord',
  'storyLesson',
  'storyCourse',
  'reviewLog',
  'reviewSession',
  'generatedSentence',
  'userWordMeaning',
  'userWord',
  'meaning',
  'wordGroupItem',
  'wordGroup',
  'word',
])

async function destructiveVocabularyReset(prisma) {
  return prisma.$transaction(async (tx) => {
    for (const model of DESTRUCTIVE_VOCABULARY_RESET_ORDER) {
      await tx[model].deleteMany()
    }
  })
}

module.exports = {
  DESTRUCTIVE_VOCABULARY_RESET_ORDER,
  destructiveVocabularyReset,
}
