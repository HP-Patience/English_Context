import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const schema = await readFile(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')

function modelBlock(name) {
  const match = schema.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `expected model ${name} to be declared`)
  return match[1]
}

function assertField(block, fieldName, typePattern = '[^\\n]+') {
  assert.match(block, new RegExp(`\\n\\s*${fieldName}\\s+${typePattern}`), `expected field ${fieldName}`)
}

function assertContains(block, expected) {
  assert.ok(block.includes(expected), `expected ${expected}`)
}

test('Word persists an optional phonetic supplied by the vocabulary source', () => {
  const block = modelBlock('Word')
  assertField(block, 'phonetic', 'String\\?')
})

test('declares the versioned story course, lesson, and progress models', () => {
  for (const name of [
    'StoryCourse',
    'StoryLesson',
    'StoryLessonWord',
    'UserStoryProgress',
    'UserStoryWordProgress',
    'StoryReviewAttempt',
  ]) {
    modelBlock(name)
  }
})

test('StoryCourse provides a versioned single-ready publication boundary', () => {
  const block = modelBlock('StoryCourse')
  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['version', 'Int\\s+@unique'],
    ['status', 'String\\s+@default\\(\"draft\"\\)'],
    ['readySlot', 'String\\?\\s+@unique'],
    ['sourceFingerprint', 'String\\b'],
    ['summaryFingerprint', 'String\\b'],
    ['outlineFingerprint', 'String\\b'],
    ['assignmentFingerprint', 'String\\b'],
    ['publishedAt', 'DateTime\\?'],
    ['archivedAt', 'DateTime\\?'],
  ]) assertField(block, field, pattern)
  assertContains(block, '@@index([status])')
  assert.doesNotMatch(block, /rawNovel|novelText|sourceText/i)
})

test('StoryLesson belongs to a course and persists generated metadata without raw novel text', () => {
  const block = modelBlock('StoryLesson')

  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['courseId', 'String\\b'],
    ['order', 'Int\\b'],
    ['title', 'String\\b'],
    ['wordGroupId', 'String\\?'],
    ['sourceChapterStart', 'String\\b'],
    ['sourceChapterEnd', 'String\\b'],
    ['sourceSummary', 'String\\b'],
    ['continuityNotes', 'String\\b'],
    ['contentJson', 'String\\b'],
    ['status', 'String\\s+@default\\("draft"\\)'],
    ['generationError', 'String\\?'],
    ['generatedAt', 'DateTime\\?'],
    ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
    ['updatedAt', 'DateTime\\s+@updatedAt'],
  ]) {
    assertField(block, field, pattern)
  }

  assertField(block, 'course', 'StoryCourse\\s+@relation\\(fields: \\[courseId\\], references: \\[id\\], onDelete: Restrict\\)')
  assertContains(block, '@@unique([courseId, order])')
  assertContains(block, '@@index([courseId, status])')
  assert.doesNotMatch(block, /rawNovel|novelText|sourceText/i)
})

test('StoryLessonWord links one lesson to an existing word and selected meaning', () => {
  const block = modelBlock('StoryLessonWord')

  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['lessonId', 'String\\b'],
    ['wordId', 'String\\b'],
    ['meaningId', 'String\\b'],
    ['sortOrder', 'Int\\b'],
    ['glossCn', 'String\\b'],
    ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
  ]) {
    assertField(block, field, pattern)
  }

  assertField(block, 'lesson', 'StoryLesson\\s+@relation\\(fields: \\[lessonId\\], references: \\[id\\]\\)')
  assertField(block, 'word', 'Word\\s+@relation\\(fields: \\[wordId\\], references: \\[id\\]\\)')
  assertField(block, 'meaning', 'Meaning\\s+@relation\\(fields: \\[meaningId\\], references: \\[id\\]\\)')
  assertContains(block, '@@unique([lessonId, wordId])')
})

test('user story progress models capture lesson steps and review scheduling', () => {
  const lessonProgress = modelBlock('UserStoryProgress')
  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['userId', 'String\\b'],
    ['lessonId', 'String\\b'],
    ['currentStep', 'Int\\s+@default\\(1\\)'],
    ['status', 'String\\s+@default\\("not_started"\\)'],
    ['step1CompletedAt', 'DateTime\\?'],
    ['step2CompletedAt', 'DateTime\\?'],
    ['step3CompletedAt', 'DateTime\\?'],
    ['completedAt', 'DateTime\\?'],
    ['updatedAt', 'DateTime\\s+@updatedAt'],
  ]) {
    assertField(lessonProgress, field, pattern)
  }
  assertContains(lessonProgress, '@@unique([userId, lessonId])')

  const wordProgress = modelBlock('UserStoryWordProgress')
  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['userId', 'String\\b'],
    ['lessonWordId', 'String\\b'],
    ['reviewRoundCompleted', 'Int\\s+@default\\(0\\)'],
    ['nextReviewAt', 'DateTime\\?'],
    ['lastResult', 'String\\?'],
    ['lastReviewedAt', 'DateTime\\?'],
  ]) {
    assertField(wordProgress, field, pattern)
  }
  assertContains(wordProgress, '@@unique([userId, lessonWordId])')
  assertContains(wordProgress, '@@index([nextReviewAt])')
})

test('story review attempts are unique per user lesson word and round', () => {
  const block = modelBlock('StoryReviewAttempt')

  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['userId', 'String\\b'],
    ['lessonWordId', 'String\\b'],
    ['round', 'Int\\b'],
    ['result', 'String\\b'],
    ['nextReviewAt', 'DateTime\\?'],
    ['grade', 'Int\\?'],
    ['userWordMeaningMastery', 'Float\\?'],
    ['userWordMastery', 'Float\\?'],
    ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
  ]) {
    assertField(block, field, pattern)
  }

  assertContains(block, '@@unique([userId, lessonWordId, round])')
})

test('dated story completion histories preserve independent client events', () => {
  for (const [name, dimension] of [
    ['UserStoryParagraphCompletion', ['paragraphIndex', 'Int\\b']],
    ['UserStoryStepCompletion', ['step', 'Int\\b']],
    ['UserStoryLessonCompletion', null],
  ]) {
    const block = modelBlock(name)
    for (const [field, pattern] of [
      ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
      ['completionId', 'String\\b'],
      ['userId', 'String\\b'],
      ['lessonId', 'String\\b'],
      ['completionDate', 'DateTime\\s+@db\\.Date'],
      ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
    ]) assertField(block, field, pattern)
    if (dimension) assertField(block, dimension[0], dimension[1])
    assertField(block, 'user', 'User\\s+@relation\\(fields: \\[userId\\], references: \\[id\\]\\)')
    assertField(block, 'lesson', 'StoryLesson\\s+@relation\\(fields: \\[lessonId\\], references: \\[id\\]\\)')
    assertContains(block, '@@unique([userId, completionId])')
    assertContains(block, '@@index([lessonId, completionDate])')
  }
})

test('story paragraph bookmarks have one stable row per user lesson card', () => {
  const block = modelBlock('UserStoryParagraphBookmark')
  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
    ['userId', 'String\\b'],
    ['lessonId', 'String\\b'],
    ['paragraphIndex', 'Int\\b'],
    ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
  ]) assertField(block, field, pattern)
  assertContains(block, '@@unique([userId, lessonId, paragraphIndex])')
  assertContains(block, '@@index([lessonId, paragraphIndex])')
})

test('existing core models expose relations for story data', () => {
  assertField(modelBlock('WordGroup'), 'storyLessons', 'StoryLesson\\[\\]')
  assertField(modelBlock('Word'), 'storyLessonWords', 'StoryLessonWord\\[\\]')
  assertField(modelBlock('Meaning'), 'storyLessonWords', 'StoryLessonWord\\[\\]')

  const user = modelBlock('User')
  assertField(user, 'storyProgress', 'UserStoryProgress\\[\\]')
  assertField(user, 'storyWordProgress', 'UserStoryWordProgress\\[\\]')
  assertField(user, 'storyReviewAttempts', 'StoryReviewAttempt\\[\\]')
  assertField(user, 'storyParagraphCompletions', 'UserStoryParagraphCompletion\\[\\]')
  assertField(user, 'storyStepCompletions', 'UserStoryStepCompletion\\[\\]')
  assertField(user, 'storyLessonCompletions', 'UserStoryLessonCompletion\\[\\]')
  assertField(user, 'storyParagraphBookmarks', 'UserStoryParagraphBookmark\\[\\]')

  const lesson = modelBlock('StoryLesson')
  assertField(lesson, 'paragraphCompletions', 'UserStoryParagraphCompletion\\[\\]')
  assertField(lesson, 'stepCompletions', 'UserStoryStepCompletion\\[\\]')
  assertField(lesson, 'lessonCompletions', 'UserStoryLessonCompletion\\[\\]')
  assertField(lesson, 'paragraphBookmarks', 'UserStoryParagraphBookmark\\[\\]')
})
