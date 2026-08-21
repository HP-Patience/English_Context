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

test('declares the five story lesson and progress models', () => {
  for (const name of [
    'StoryLesson',
    'StoryLessonWord',
    'UserStoryProgress',
    'UserStoryWordProgress',
    'StoryReviewAttempt',
  ]) {
    modelBlock(name)
  }
})

test('StoryLesson persists generated lesson metadata without raw novel text', () => {
  const block = modelBlock('StoryLesson')

  for (const [field, pattern] of [
    ['id', 'String\\s+@id\\s+@default\\(cuid\\(\\)\\)'],
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

  assertContains(block, '@@index([order])')
  assertContains(block, '@@index([status])')
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
    ['createdAt', 'DateTime\\s+@default\\(now\\(\\)\\)'],
  ]) {
    assertField(block, field, pattern)
  }

  assertContains(block, '@@unique([userId, lessonWordId, round])')
})

test('existing core models expose relations for story data', () => {
  assertField(modelBlock('WordGroup'), 'storyLessons', 'StoryLesson\\[\\]')
  assertField(modelBlock('Word'), 'storyLessonWords', 'StoryLessonWord\\[\\]')
  assertField(modelBlock('Meaning'), 'storyLessonWords', 'StoryLessonWord\\[\\]')

  const user = modelBlock('User')
  assertField(user, 'storyProgress', 'UserStoryProgress\\[\\]')
  assertField(user, 'storyWordProgress', 'UserStoryWordProgress\\[\\]')
  assertField(user, 'storyReviewAttempts', 'StoryReviewAttempt\\[\\]')
})
