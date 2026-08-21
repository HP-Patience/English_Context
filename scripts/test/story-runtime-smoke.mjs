import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { createFakeStoryPrisma } from './helpers/fake-story-prisma.mjs'

const LOCAL_USER_ID = 'story-runtime-smoke-user'
const ROW_SOURCE_SUMMARY_SENTINEL = 'PRIVATE_ROW_SOURCE_SUMMARY_SENTINEL'
const ROW_CONTINUITY_NOTES_SENTINEL = 'PRIVATE_ROW_CONTINUITY_NOTES_SENTINEL'
const JSON_SOURCE_SUMMARY_SENTINEL = 'PRIVATE_JSON_SOURCE_SUMMARY_SENTINEL'
const JSON_CONTINUITY_NOTES_SENTINEL = 'PRIVATE_JSON_CONTINUITY_NOTES_SENTINEL'

const runtimeBoundary = vi.hoisted(() => {
  const novelFileName = '蛊真人.txt'

  function pathText(value) {
    if (typeof value === 'string') return value
    if (value instanceof URL) return value.href
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('utf8')
    return null
  }

  function assertSafePath(value, operation) {
    const raw = pathText(value)
    if (!raw) return
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      // Invalid URL escaping is irrelevant unless the literal novel filename is present.
    }
    const basename = decoded.normalize('NFC').replaceAll('\\', '/').split('/').at(-1)
    if (basename === novelFileName) {
      throw new Error(`Story runtime attempted ${operation} on the raw novel path`)
    }
  }

  function blockOfflineModule(moduleId) {
    throw new Error(`Story runtime imported offline generation module: ${moduleId}`)
  }

  return { assertSafePath, blockOfflineModule }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  const guardedNames = [
    'access', 'accessSync', 'createReadStream', 'existsSync', 'lstat', 'lstatSync',
    'open', 'openSync', 'readFile', 'readFileSync', 'stat', 'statSync',
  ]
  const guarded = Object.fromEntries(guardedNames.map((name) => [name, function guardedFsCall(...args) {
    runtimeBoundary.assertSafePath(args[0], `node:fs.${name}`)
    return Reflect.apply(actual[name], actual.default ?? actual, args)
  }]))
  const guardedPromises = Object.fromEntries(
    ['access', 'lstat', 'open', 'readFile', 'stat'].map((name) => [name, async function guardedPromiseCall(...args) {
      runtimeBoundary.assertSafePath(args[0], `node:fs.promises.${name}`)
      return Reflect.apply(actual.promises[name], actual.promises, args)
    }]),
  )
  return {
    ...actual,
    ...guarded,
    promises: { ...actual.promises, ...guardedPromises },
    default: { ...actual.default, ...guarded, promises: { ...actual.promises, ...guardedPromises } },
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  const guarded = Object.fromEntries(
    ['access', 'lstat', 'open', 'readFile', 'stat'].map((name) => [name, async function guardedPromiseCall(...args) {
      runtimeBoundary.assertSafePath(args[0], `node:fs/promises.${name}`)
      return Reflect.apply(actual[name], actual.default ?? actual, args)
    }]),
  )
  return { ...actual, ...guarded, default: { ...actual.default, ...guarded } }
})

vi.mock('../parse-novel.mjs', () => runtimeBoundary.blockOfflineModule('../parse-novel.mjs'))
vi.mock('../build-story-outline.mjs', () => runtimeBoundary.blockOfflineModule('../build-story-outline.mjs'))
vi.mock('../generate-story-lessons.mjs', () => runtimeBoundary.blockOfflineModule('../generate-story-lessons.mjs'))
vi.mock('../validate-story-lessons.mjs', () => runtimeBoundary.blockOfflineModule('../validate-story-lessons.mjs'))
vi.mock('../lib/input-fingerprint.mjs', () => runtimeBoundary.blockOfflineModule('../lib/input-fingerprint.mjs'))
vi.mock('../lib/llm-json.mjs', () => runtimeBoundary.blockOfflineModule('../lib/llm-json.mjs'))
vi.mock('../lib/novel-parser.mjs', () => runtimeBoundary.blockOfflineModule('../lib/novel-parser.mjs'))
vi.mock('../lib/story-content.mjs', () => runtimeBoundary.blockOfflineModule('../lib/story-content.mjs'))
vi.mock('../lib/story-lesson-generator.mjs', () => runtimeBoundary.blockOfflineModule('../lib/story-lesson-generator.mjs'))
vi.mock('../lib/story-lesson-repository.mjs', () => runtimeBoundary.blockOfflineModule('../lib/story-lesson-repository.mjs'))
vi.mock('../lib/story-outline.mjs', () => runtimeBoundary.blockOfflineModule('../lib/story-outline.mjs'))
vi.mock('../lib/story-source-coverage.mjs', () => runtimeBoundary.blockOfflineModule('../lib/story-source-coverage.mjs'))
vi.mock('../lib/word-import.js', () => runtimeBoundary.blockOfflineModule('../lib/word-import.js'))

const injected = vi.hoisted(() => ({
  prisma: {},
  userId: 'story-runtime-smoke-user',
}))

vi.mock('@/lib/prisma', () => ({
  prisma: injected.prisma,
  getLocalUserId: vi.fn(async () => injected.userId),
}))

vi.mock('openai', () => {
  throw new Error('Runtime smoke loaded OpenAI; ready lessons must not require a runtime LLM')
})

const [
  { GET: getLessons },
  { GET: getLesson },
  { POST: postProgress },
  { GET: getReviewQueue, POST: postReview },
] = await Promise.all([
  import('../../src/app/api/story/lessons/route'),
  import('../../src/app/api/story/lessons/[id]/route'),
  import('../../src/app/api/story/lessons/[id]/progress/route'),
  import('../../src/app/api/story/review/route'),
])

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixtureTimestamp = new Date('2026-08-21T00:00:00.000Z')

function makeContent({
  id,
  order,
  title,
  words,
  sourceSummary = 'Synthetic fixture summary; no novel text.',
  continuityNotes = 'Synthetic fixture continuity.',
}) {
  return JSON.stringify({
    title,
    order,
    sourceChapterStart: `fixture-${id}-start`,
    sourceChapterEnd: `fixture-${id}-end`,
    sourceSummary,
    continuityNotes,
    paragraphs: [
      {
        sceneTitle: 'Synthetic courtyard',
        segments: [
          { type: 'text', value: 'The fixture learner meets ' },
          ...words.flatMap((word, index) => [
            {
              type: 'targetWord',
              word: word.text,
              definitionCn: word.glossCn,
              phonetic: word.phonetic,
              wordOrder: index + 1,
            },
            { type: 'text', value: index === words.length - 1 ? '.' : ' and ' },
          ]),
        ],
      },
    ],
  })
}

async function createSeededPrisma() {
  const words = [
    {
      id: 'fixture-word-resolve',
      text: 'resolve',
      phonetic: '/rɪˈzɒlv/',
      language: 'en',
      glossCn: '决心',
      meanings: [{
        id: 'fixture-meaning-resolve',
        wordId: 'fixture-word-resolve',
        partOfSpeech: 'n.',
        definition: 'firm determination',
        definitionCn: '坚定决心',
        example: 'The learner shows resolve.',
      }],
    },
    {
      id: 'fixture-word-vigilant',
      text: 'vigilant',
      phonetic: '/ˈvɪdʒɪlənt/',
      language: 'en',
      glossCn: '警觉的',
      meanings: [{
        id: 'fixture-meaning-vigilant',
        wordId: 'fixture-word-vigilant',
        partOfSpeech: 'adj.',
        definition: 'watchful for danger',
        definitionCn: '对危险保持警觉',
        example: 'The learner remains vigilant.',
      }],
    },
    {
      id: 'fixture-word-advance',
      text: 'advance',
      phonetic: '/ədˈvɑːns/',
      language: 'en',
      glossCn: '前进',
      meanings: [{
        id: 'fixture-meaning-advance',
        wordId: 'fixture-word-advance',
        partOfSpeech: 'v.',
        definition: 'move forward',
        definitionCn: '向前推进',
        example: 'The learner can advance.',
      }],
    },
  ]
  const prisma = createFakeStoryPrisma({
    wordGroups: [{ id: 'fixture-group', name: 'Synthetic fixture group', sortOrder: 1, words }],
  })

  await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: {
      id: LOCAL_USER_ID,
      email: 'story-runtime-smoke@example.invalid',
      name: 'Story Runtime Smoke User',
      interests: '[]',
      dailyTarget: 30,
      ttsConfig: '{}',
      createdAt: fixtureTimestamp,
    },
  })

  prisma.state.courses.set('fixture-ready-course', {
    id: 'fixture-ready-course',
    version: 1,
    status: 'ready',
    readySlot: 'ready',
    sourceFingerprint: 'fixture-source-fingerprint-ready',
    summaryFingerprint: 'fixture-summary-fingerprint-ready',
    outlineFingerprint: 'fixture-outline-fingerprint-ready',
    assignmentFingerprint: 'fixture-assignment-fingerprint-ready',
    generationError: null,
    publishedAt: fixtureTimestamp,
    archivedAt: null,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  })
  prisma.state.courses.set('fixture-draft-course', {
    id: 'fixture-draft-course',
    version: 2,
    status: 'draft',
    readySlot: null,
    sourceFingerprint: 'fixture-source-fingerprint-draft',
    summaryFingerprint: 'fixture-summary-fingerprint-draft',
    outlineFingerprint: 'fixture-outline-fingerprint-draft',
    assignmentFingerprint: 'fixture-assignment-fingerprint-draft',
    generationError: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  })

  const firstLessonWords = words.slice(0, 2)
  const lessonDefaults = {
    wordGroupId: 'fixture-group',
    generationError: null,
    generatedAt: fixtureTimestamp,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  }
  prisma.state.lessons.set('fixture-lesson-1', {
    id: 'fixture-lesson-1',
    courseId: 'fixture-ready-course',
    order: 1,
    title: 'Synthetic lesson one',
    sourceChapterStart: 'fixture-one-start',
    sourceChapterEnd: 'fixture-one-end',
    sourceSummary: ROW_SOURCE_SUMMARY_SENTINEL,
    continuityNotes: ROW_CONTINUITY_NOTES_SENTINEL,
    contentJson: makeContent({
      id: 'one',
      order: 1,
      title: 'Synthetic lesson one',
      words: firstLessonWords,
      sourceSummary: JSON_SOURCE_SUMMARY_SENTINEL,
      continuityNotes: JSON_CONTINUITY_NOTES_SENTINEL,
    }),
    status: 'ready',
    ...lessonDefaults,
  })
  prisma.state.lessons.set('fixture-lesson-2', {
    id: 'fixture-lesson-2',
    courseId: 'fixture-ready-course',
    order: 2,
    title: 'Synthetic lesson two',
    sourceChapterStart: 'fixture-two-start',
    sourceChapterEnd: 'fixture-two-end',
    sourceSummary: 'Synthetic row summary for lesson two.',
    continuityNotes: 'Synthetic row continuity for lesson two.',
    contentJson: makeContent({ id: 'two', order: 2, title: 'Synthetic lesson two', words: words.slice(2) }),
    status: 'ready',
    ...lessonDefaults,
  })
  prisma.state.lessons.set('fixture-hidden-draft-lesson', {
    id: 'fixture-hidden-draft-lesson',
    courseId: 'fixture-ready-course',
    order: 3,
    title: 'Hidden draft lesson',
    sourceChapterStart: 'hidden',
    sourceChapterEnd: 'hidden',
    sourceSummary: 'Synthetic hidden summary.',
    continuityNotes: 'Synthetic hidden continuity.',
    contentJson: makeContent({ id: 'hidden', order: 3, title: 'Hidden draft lesson', words: words.slice(2) }),
    status: 'draft',
    ...lessonDefaults,
  })
  prisma.state.lessons.set('fixture-other-course-lesson', {
    id: 'fixture-other-course-lesson',
    courseId: 'fixture-draft-course',
    order: 1,
    title: 'Other course lesson',
    sourceChapterStart: 'other',
    sourceChapterEnd: 'other',
    sourceSummary: 'Synthetic other-course summary.',
    continuityNotes: 'Synthetic other-course continuity.',
    contentJson: makeContent({ id: 'other', order: 1, title: 'Other course lesson', words: words.slice(2) }),
    status: 'ready',
    ...lessonDefaults,
  })

  for (const [index, word] of firstLessonWords.entries()) {
    prisma.state.lessonWords.set(`fixture-lesson-word-${index + 1}`, {
      id: `fixture-lesson-word-${index + 1}`,
      lessonId: 'fixture-lesson-1',
      wordId: word.id,
      meaningId: word.meanings[0].id,
      sortOrder: index + 1,
      glossCn: word.glossCn,
      createdAt: fixtureTimestamp,
    })
  }
  prisma.state.lessonWords.set('fixture-next-lesson-word', {
    id: 'fixture-next-lesson-word',
    lessonId: 'fixture-lesson-2',
    wordId: words[2].id,
    meaningId: words[2].meanings[0].id,
    sortOrder: 1,
    glossCn: words[2].glossCn,
    createdAt: fixtureTimestamp,
  })
  prisma.state.lessonWords.set('fixture-other-course-word', {
    id: 'fixture-other-course-word',
    lessonId: 'fixture-other-course-lesson',
    wordId: words[2].id,
    meaningId: words[2].meanings[0].id,
    sortOrder: 1,
    glossCn: words[2].glossCn,
    createdAt: fixtureTimestamp,
  })

  prisma.validateFixture()
  return prisma
}

function jsonRequest(url, body) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function responseJson(response) {
  return JSON.parse(await response.text())
}

async function saveStep(step) {
  return postProgress(
    jsonRequest('http://runtime.test/api/story/lessons/fixture-lesson-1/progress', { step }),
    { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
  )
}

async function collectRuntimeFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await collectRuntimeFiles(path))
    else if (['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.includes('.test.')) files.push(path)
  }
  return files
}

beforeEach(async () => {
  injected.userId = LOCAL_USER_ID
  const prisma = await createSeededPrisma()
  for (const key of Reflect.ownKeys(injected.prisma)) delete injected.prisma[key]
  Object.assign(injected.prisma, prisma)
})

describe('story runtime smoke', () => {
  it('persists one seeded-user ready-course journey through Step1-Step4 without blocking the next lesson', async () => {
    const initialListResponse = await getLessons()
    expect(initialListResponse.status).toBe(200)
    expect(await responseJson(initialListResponse)).toEqual({
      lessons: [
        expect.objectContaining({ id: 'fixture-lesson-1', order: 1, targetWordCount: 2, completedStep: 0 }),
        expect.objectContaining({ id: 'fixture-lesson-2', order: 2, targetWordCount: 1, completedStep: 0 }),
      ],
      currentLessonId: 'fixture-lesson-1',
      dueCount: 0,
    })

    const detailResponse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-lesson-1'),
      { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
    )
    expect(detailResponse.status).toBe(200)
    const detailText = await detailResponse.text()
    expect(detailText).not.toContain('sourceSummary')
    expect(detailText).not.toContain('continuityNotes')
    for (const sentinel of [
      ROW_SOURCE_SUMMARY_SENTINEL,
      ROW_CONTINUITY_NOTES_SENTINEL,
      JSON_SOURCE_SUMMARY_SENTINEL,
      JSON_CONTINUITY_NOTES_SENTINEL,
    ]) {
      expect(detailText).not.toContain(sentinel)
    }
    const initialDetail = JSON.parse(detailText).lesson
    expect(initialDetail.content.paragraphs).toEqual([
      expect.objectContaining({
        sceneTitle: 'Synthetic courtyard',
        segments: expect.arrayContaining([
          expect.objectContaining({ type: 'targetWord', word: 'resolve', definitionCn: '决心', wordOrder: 1 }),
          expect.objectContaining({ type: 'targetWord', word: 'vigilant', definitionCn: '警觉的', wordOrder: 2 }),
        ]),
      }),
    ])

    for (const [step, expected] of [
      [1, { completedStep: 1, currentStep: 2, status: 'learning' }],
      [2, { completedStep: 2, currentStep: 3, status: 'learning' }],
      [3, { completedStep: 3, currentStep: 4, status: 'first_passed' }],
    ]) {
      const response = await saveStep(step)
      expect(response.status).toBe(200)
      expect((await responseJson(response)).progress).toMatchObject(expected)
    }

    const unlockedListResponse = await getLessons()
    const unlockedList = await responseJson(unlockedListResponse)
    expect(unlockedList.currentLessonId).toBe('fixture-lesson-2')
    expect(unlockedList.dueCount).toBe(2)
    expect(unlockedList.lessons[0]).toMatchObject({
      id: 'fixture-lesson-1', completedStep: 3, currentStep: 4, dueReviewCount: 2,
    })

    const queueResponse = await getReviewQueue(
      new NextRequest('http://runtime.test/api/story/review?lessonId=fixture-lesson-1'),
    )
    expect(queueResponse.status).toBe(200)
    const queue = await responseJson(queueResponse)
    expect(queue).toMatchObject({ dueCount: 2 })
    expect(queue.lessons[0].words.map((word) => word.lessonWordId)).toEqual([
      'fixture-lesson-word-1',
      'fixture-lesson-word-2',
    ])
    expect(queue.lessons[0].words.every((word) => word.dueRound === 1 && word.nextReviewAt === null)).toBe(true)

    const invalidIdentifierResponse = await postReview(jsonRequest(
      'http://runtime.test/api/story/review',
      { lessonWordId: 'fixture-lesson-word-1', result: 'remember' },
    ))
    expect(invalidIdentifierResponse.status).toBe(400)

    const reviewStartedAt = Date.now()
    const reviewResponse = await postReview(jsonRequest(
      'http://runtime.test/api/story/review',
      { lessonWordId: 'fixture-lesson-word-1', result: 'remembered' },
    ))
    expect(reviewResponse.status).toBe(200)
    const submittedReview = (await responseJson(reviewResponse)).review
    expect(submittedReview).toMatchObject({
      lessonWordId: 'fixture-lesson-word-1',
      round: 1,
      roundCompleted: 1,
      result: 'remembered',
      grade: 4,
    })
    expect(new Date(submittedReview.nextReviewAt).getTime()).toBeGreaterThan(reviewStartedAt)

    const reloadedDetailResponse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-lesson-1'),
      { params: Promise.resolve({ id: 'fixture-lesson-1' }) },
    )
    const reloadedDetail = (await responseJson(reloadedDetailResponse)).lesson
    expect(reloadedDetail.progress).toMatchObject({ completedStep: 3, currentStep: 4, status: 'first_passed' })
    expect(reloadedDetail.reviewState).toEqual({
      words: [
        { lessonWordId: 'fixture-lesson-word-1', roundCompleted: 1, nextReviewAt: submittedReview.nextReviewAt },
        { lessonWordId: 'fixture-lesson-word-2', roundCompleted: 0, nextReviewAt: null },
      ],
      attempts: [{ lessonWordId: 'fixture-lesson-word-1', round: 1, result: 'remembered' }],
    })

    const reloadedList = await responseJson(await getLessons())
    expect(reloadedList).toMatchObject({ currentLessonId: 'fixture-lesson-2', dueCount: 1 })
    expect(reloadedList.lessons[1]).toMatchObject({ id: 'fixture-lesson-2', completedStep: 0 })
  })

  it('rejects an unknown local user before any user-scoped progress is persisted', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    injected.userId = 'unknown-story-runtime-user'
    try {
      const response = await saveStep(1)
      expect(response.status).toBe(500)
      expect(await responseJson(response)).toEqual({ error: 'Internal server error' })
      expect(injected.prisma.state.userStoryProgress.size).toBe(0)
      expect(errorSpy).toHaveBeenCalledWith('Failed to save story progress', expect.any(Error))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('installs import tripwires without loading the raw novel or offline generator', async () => {
    await expect(import('../../蛊真人.txt')).rejects.toThrow('Story runtime attempted to import the raw novel path')
    const offlineImportError = await import('../parse-novel.mjs').then(
      () => null,
      (error) => error,
    )
    expect(offlineImportError).toBeInstanceOf(Error)
    expect(offlineImportError.cause).toMatchObject({
      message: 'Story runtime imported offline generation module: ../parse-novel.mjs',
    })
  })

  it('scopes reads to the ready slot and has no runtime novel, offline generator, or LLM dependency', async () => {
    const hiddenDraft = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-hidden-draft-lesson'),
      { params: Promise.resolve({ id: 'fixture-hidden-draft-lesson' }) },
    )
    const otherCourse = await getLesson(
      new NextRequest('http://runtime.test/api/story/lessons/fixture-other-course-lesson'),
      { params: Promise.resolve({ id: 'fixture-other-course-lesson' }) },
    )
    expect(hiddenDraft.status).toBe(404)
    expect(otherCourse.status).toBe(404)

    const runtimeFiles = [
      ...await collectRuntimeFiles(join(projectRoot, 'src', 'app', 'story')),
      ...await collectRuntimeFiles(join(projectRoot, 'src', 'app', 'api', 'story')),
      ...await collectRuntimeFiles(join(projectRoot, 'src', 'components', 'story')),
      ...(await collectRuntimeFiles(join(projectRoot, 'src', 'lib')))
        .filter((file) => /^story-/.test(file.split(/[\\/]/).at(-1)) || file.endsWith(`${join('src', 'lib', 'prisma')}.ts`)),
    ]
    expect(runtimeFiles.length).toBeGreaterThan(6)

    for (const file of runtimeFiles) {
      const source = await readFile(file, 'utf8')
      const label = relative(projectRoot, file)
      expect(source, label).not.toContain('蛊真人.txt')
      expect(source, label).not.toMatch(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]node:fs(?:\/promises)?['"]/)
      expect(source, label).not.toMatch(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:openai|@\/lib\/llm)['"]/)
      expect(source, label).not.toMatch(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*scripts[\\/][^'"]*['"]/)
    }
  })
})
