import test from 'node:test'
import assert from 'node:assert/strict'

import { createOrResumeDraftCourse, findReadyCourse, persistDraftLesson } from '../lib/story-lesson-repository.mjs'
import { validateReadyLessons } from '../validate-story-lessons.mjs'
import { createFakeStoryPrisma } from './helpers/fake-story-prisma.mjs'

const fingerprints = {
  sourceFingerprint: 'source',
  summaryFingerprint: 'summary',
  outlineFingerprint: 'outline',
  assignmentFingerprint: 'assignment',
}

function makeLessonDocument() {
  return {
    title: '第1课故事',
    order: 1,
    sourceChapterStart: '1',
    sourceChapterEnd: '1',
    sourceSummary: '剧情摘要',
    continuityNotes: '继续',
    paragraphs: [{
      sceneTitle: '场景',
      segments: [
        { type: 'text', value: '先学习 ' },
        { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', phonetic: '/ˈælfə/', wordOrder: 1 },
        { type: 'text', value: ' 穿过石门继续赶路，随后遇见 ' },
        { type: 'targetWord', word: 'beta', definitionCn: '贝塔', phonetic: '/ˈbeɪtə/', wordOrder: 2 },
      ],
    }],
  }
}

function makeMaps({ mismatchedMeaning = false, alphaPhonetic = null, betaPhonetic = null } = {}) {
  return {
    wordMap: new Map([
      ['alpha', { id: 'word-alpha', text: 'alpha', phonetic: alphaPhonetic }],
      ['beta', { id: 'word-beta', text: 'beta', phonetic: betaPhonetic }],
    ]),
    meaningMap: new Map([
      ['alpha', { id: 'meaning-alpha', wordId: mismatchedMeaning ? 'different-word' : 'word-alpha', partOfSpeech: 'n.', definition: 'alpha fixture meaning', definitionCn: '阿尔法' }],
      ['beta', { id: 'meaning-beta', wordId: 'word-beta', partOfSpeech: 'n.', definition: 'beta fixture meaning', definitionCn: '贝塔' }],
    ]),
  }
}

async function makeDraftPrisma({ alphaPhonetic = null, betaPhonetic = null } = {}) {
  const { wordMap, meaningMap } = makeMaps({ alphaPhonetic, betaPhonetic })
  const prisma = createFakeStoryPrisma({
    wordGroups: [{
      words: [...wordMap.values()].map((word, index) => ({
        sortOrder: index + 1,
        word: { ...word, meanings: [meaningMap.get(word.text)] },
      })),
    }],
  })
  const course = await createOrResumeDraftCourse({ prisma, fingerprints })
  return { prisma, course }
}

test('valid lesson is persisted idempotently inside one draft course with one StoryLessonWord per target segment', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps()

  const first = await persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap })
  const second = await persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap })

  assert.equal(first.lessonId, second.lessonId)
  assert.equal(first.createdWordCount, 2)
  assert.equal(second.createdWordCount, 2)
  assert.equal(prisma.state.lessons.size, 1)
  assert.equal(prisma.state.lessonWords.size, 2)
  assert.deepEqual([...prisma.state.lessonWords.values()].map((row) => row.sortOrder), [1, 2])
  assert.equal([...prisma.state.lessons.values()][0].status, 'ready')
  assert.equal([...prisma.state.lessons.values()][0].courseId, course.id)
  assert.equal(prisma.state.courses.get(course.id).status, 'draft')
  assert.equal(prisma.state.words.get('word-alpha').phonetic, '/ˈælfə/')
  assert.equal(prisma.state.words.get('word-beta').phonetic, '/ˈbeɪtə/')
})


test('draft persistence allows an identical existing phonetic value', async () => {
  const { prisma, course } = await makeDraftPrisma({ alphaPhonetic: '/ˈælfə/' })
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps({ alphaPhonetic: '/ˈælfə/' })

  await assert.doesNotReject(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
  )
  assert.equal(prisma.state.words.get('word-alpha').phonetic, '/ˈælfə/')
})

test('draft persistence rejects conflicting existing phonetics transactionally', async () => {
  const { prisma, course } = await makeDraftPrisma({ betaPhonetic: '/ˈbiːtə/' })
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps({ betaPhonetic: '/ˈbiːtə/' })

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    /conflicting phonetic.*beta.*\/ˈbiːtə\/.*\/ˈbeɪtə\//,
  )

  assert.equal(prisma.state.words.get('word-alpha').phonetic, null)
  assert.equal(prisma.state.words.get('word-beta').phonetic, '/ˈbiːtə/')
  assert.equal([...prisma.state.lessons.values()][0].status, 'failed')
  assert.equal(prisma.state.lessonWords.size, 0)
})

test('Meaning/Word mismatches are rejected before a draft lesson becomes ready', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  const { wordMap, meaningMap } = makeMaps({ mismatchedMeaning: true })

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    /meaning-alpha.*does not belong to word alpha/,
  )

  const lesson = [...prisma.state.lessons.values()][0]
  assert.equal(lesson.status, 'failed')
  assert.match(lesson.generationError, /meaning-alpha/)
  assert.equal(prisma.state.lessonWords.size, 0)
})

test('duplicate target segments are rejected by repository before draft-ready persistence', async () => {
  const { prisma, course } = await makeDraftPrisma()
  const lessonDocument = makeLessonDocument()
  lessonDocument.paragraphs[0].segments.push(
    { type: 'text', value: ' 众人继续向山谷深处前行，随后再次看见 ' },
    { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', phonetic: '/ˈælfə/', wordOrder: 3 },
  )
  const { wordMap, meaningMap } = makeMaps()

  await assert.rejects(
    persistDraftLesson({ prisma, courseId: course.id, lessonDocument, wordMap, meaningMap }),
    /duplicate target word segment: alpha/,
  )

  const lesson = [...prisma.state.lessons.values()][0]
  assert.equal(lesson.status, 'failed')
  assert.equal(prisma.state.lessonWords.size, 0)
})

function makePersistedLesson({ rows = undefined } = {}) {
  const content = makeLessonDocument()
  const lessonId = 'lesson-1'
  const defaultRows = [
    {
      id: 'lw-alpha',
      lessonId,
      wordId: 'word-alpha',
      meaningId: 'meaning-alpha',
      sortOrder: 1,
      glossCn: '阿尔法',
      word: { id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/' },
      meaning: { id: 'meaning-alpha', wordId: 'word-alpha' },
    },
    {
      id: 'lw-beta',
      lessonId,
      wordId: 'word-beta',
      meaningId: 'meaning-beta',
      sortOrder: 2,
      glossCn: '贝塔',
      word: { id: 'word-beta', text: 'beta', phonetic: '/ˈbeɪtə/' },
      meaning: { id: 'meaning-beta', wordId: 'word-beta' },
    },
  ]
  return {
    id: lessonId,
    order: content.order,
    status: 'ready',
    contentJson: JSON.stringify(content),
    words: rows ?? defaultRows,
  }
}

test('story validation returns structured errors for missing, non-string, or blank content phonetics', () => {
  for (const phonetic of [undefined, 42, '   ']) {
    const lesson = makePersistedLesson()
    const content = JSON.parse(lesson.contentJson)
    content.paragraphs[0].segments[1].phonetic = phonetic
    lesson.contentJson = JSON.stringify(content)

    let report
    assert.doesNotThrow(() => {
      report = validateReadyLessons({
        lessons: [lesson],
        allWordTexts: ['alpha', 'beta'],
        expectedWordCount: 2,
        minLessons: 1,
        maxLessons: 1,
        maxWordsPerLesson: 100,
      })
    })
    assert.equal(report.ok, false)
    assert.match(report.errors.join('\n'), /phonetic must be a non-empty string/i)
  }
})

test('story validation proves a bijection between target segments and StoryLessonWord rows', () => {
  const validReport = validateReadyLessons({
    lessons: [makePersistedLesson()],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(validReport.ok, true)



  const missingPhoneticRows = structuredClone(makePersistedLesson().words)
  missingPhoneticRows[1].word.phonetic = null
  const missingPhoneticReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: missingPhoneticRows })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(missingPhoneticReport.ok, false)
  assert.match(missingPhoneticReport.errors.join('\n'), /word beta.*non-empty persisted phonetic/i)



  const conflictingPersistedRows = structuredClone(makePersistedLesson().words)
  conflictingPersistedRows[0].word.phonetic = '/ælˈfɑː/'
  const conflictingPersistedReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: conflictingPersistedRows })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(conflictingPersistedReport.ok, false)
  assert.match(conflictingPersistedReport.errors.join('\n'), /persisted phonetic.*does not match content phonetic/i)

  const missingReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: makePersistedLesson().words.slice(0, 1) })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(missingReport.ok, false)
  assert.match(missingReport.errors.join('\n'), /has 2 target segments but 1 StoryLessonWord rows|missing StoryLessonWord row.*wordOrder 2/)

  const wrongRows = structuredClone(makePersistedLesson().words)
  wrongRows[1] = {
    ...wrongRows[1],
    wordId: 'word-gamma',
    glossCn: '错误释义',
    word: { id: 'word-gamma', text: 'gamma' },
    meaning: { id: 'meaning-gamma', wordId: 'word-gamma' },
  }
  const wrongReport = validateReadyLessons({
    lessons: [makePersistedLesson({ rows: wrongRows })],
    allWordTexts: ['alpha', 'beta'],
    expectedWordCount: 2,
    minLessons: 1,
    maxLessons: 1,
    maxWordsPerLesson: 100,
  })
  assert.equal(wrongReport.ok, false)
  assert.match(wrongReport.errors.join('\n'), /row word gamma does not match content target word beta/)
  assert.match(wrongReport.errors.join('\n'), /row glossCn 错误释义 does not match content gloss 贝塔/)
})

test('ready-course lookup uses the unique ready slot and validates the returned row', async () => {
  const calls = []
  const prisma = {
    storyCourse: {
      async findUnique(args) {
        calls.push(['findUnique', args])
        return { id: 'course-ready', status: 'ready', readySlot: 'ready' }
      },
      async findMany() {
        throw new Error('ready-course lookup must not use non-transactional status/slot scans')
      },
    },
  }

  const course = await findReadyCourse(prisma)

  assert.equal(course.id, 'course-ready')
  assert.deepEqual(calls, [['findUnique', { where: { readySlot: 'ready' } }]])
})

test('ready-course lookup rejects a ready-slot row that is not published', async () => {
  const prisma = {
    storyCourse: {
      async findUnique() {
        return { id: 'course-draft', status: 'draft', readySlot: 'ready' }
      },
      async findMany() {
        throw new Error('ready-course lookup must not use non-transactional status/slot scans')
      },
    },
  }

  await assert.rejects(
    findReadyCourse(prisma),
    /publication invariant violated: course course-draft occupies the ready slot with status draft/,
  )
})
