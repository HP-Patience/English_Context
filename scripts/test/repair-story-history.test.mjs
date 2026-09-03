import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildHistoricalLessonMappings,
  migrateClonedLessonHistory,
} from '../lib/repair-story-history.mjs'

function createRepairFake({ invalidParagraph = false, bookmarkConflict = false } = {}) {
  const preserved = {
    userId: 'user-1',
    completionId: 'completion-1',
    completionDate: new Date('2026-09-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-02T03:04:05.000Z'),
  }
  const state = {
    paragraphCompletions: [{ id: 'paragraph-1', lessonId: 'old-lesson', paragraphIndex: invalidParagraph ? 2 : 1, ...preserved }],
    stepCompletions: [{ id: 'step-1', lessonId: 'old-lesson', step: 3, ...preserved }],
    lessonCompletions: [{ id: 'lesson-1', lessonId: 'old-lesson', ...preserved }],
    bookmarks: [{ id: 'bookmark-1', userId: 'user-1', lessonId: 'old-lesson', paragraphIndex: 1, createdAt: preserved.createdAt }],
  }
  if (bookmarkConflict) {
    state.bookmarks.push({ id: 'bookmark-2', userId: 'user-1', lessonId: 'new-lesson', paragraphIndex: 1, createdAt: preserved.createdAt })
  }

  const delegate = (rows) => ({
    async findMany({ where }) {
      return structuredClone(rows.filter((row) => where.lessonId.in.includes(row.lessonId)))
    },
    async update({ where, data }) {
      const row = rows.find((candidate) => candidate.id === where.id)
      Object.assign(row, structuredClone(data))
      return structuredClone(row)
    },
  })

  return {
    state,
    prisma: {
      userStoryParagraphCompletion: delegate(state.paragraphCompletions),
      userStoryStepCompletion: delegate(state.stepCompletions),
      userStoryLessonCompletion: delegate(state.lessonCompletions),
    userStoryParagraphBookmark: {
        ...delegate(state.bookmarks),
        async findUnique({ where }) {
          const key = where.userId_lessonId_paragraphIndex
          return structuredClone(state.bookmarks.find((row) => (
            row.userId === key.userId && row.lessonId === key.lessonId && row.paragraphIndex === key.paragraphIndex
          )) ?? null)
        },
        async delete({ where }) {
          const index = state.bookmarks.findIndex((row) => row.id === where.id)
          if (index < 0) throw new Error(`bookmark not found: ${where.id}`)
          return structuredClone(state.bookmarks.splice(index, 1)[0])
        },
      },
    },
  }
}

const mappings = [{ oldLessonId: 'old-lesson', newLessonId: 'new-lesson', paragraphCount: 2 }]

test('repair migration remaps all completion histories and bookmarks while preserving event fields', async () => {
  const { prisma, state } = createRepairFake()
  const before = structuredClone(state)

  const counts = await migrateClonedLessonHistory(prisma, mappings)

  assert.deepEqual(counts, {
    paragraphCompletions: 1,
    stepCompletions: 1,
    lessonCompletions: 1,
    paragraphBookmarks: 1,
    paragraphBookmarksMerged: 0,
  })
  for (const [name, rows] of Object.entries(state)) {
    assert.equal(rows[0].lessonId, 'new-lesson', name)
    assert.deepEqual({ ...rows[0], lessonId: 'old-lesson' }, before[name][0], `${name} fields changed during remap`)
  }
})

test('repair migration is idempotent after records point at cloned lessons', async () => {
  const { prisma, state } = createRepairFake()
  await migrateClonedLessonHistory(prisma, mappings)
  const afterFirstRun = structuredClone(state)

  const counts = await migrateClonedLessonHistory(prisma, mappings)

  assert.deepEqual(counts, {
    paragraphCompletions: 0,
    stepCompletions: 0,
    lessonCompletions: 0,
    paragraphBookmarks: 0,
    paragraphBookmarksMerged: 0,
  })
  assert.deepEqual(state, afterFirstRun)
})

test('repair mapping includes matching lessons from every archived and ready course version', () => {
  const contentJson = JSON.stringify({ paragraphs: [{ sceneTitle: 'one' }, { sceneTitle: 'two' }] })
  const courses = [
    { status: 'archived', lessons: [{ id: 'lesson-v1', order: 1, contentJson }] },
    { status: 'archived', lessons: [{ id: 'lesson-v2', order: 1, contentJson }] },
    { status: 'ready', lessons: [{ id: 'lesson-v3', order: 1, contentJson }] },
  ]

  const result = buildHistoricalLessonMappings(courses, [
    { oldLessonId: 'lesson-v3', newLessonId: 'lesson-v4', order: 1, paragraphCount: 2 },
  ])

  assert.deepEqual(result, [
    { oldLessonId: 'lesson-v1', newLessonId: 'lesson-v4', paragraphCount: 2 },
    { oldLessonId: 'lesson-v2', newLessonId: 'lesson-v4', paragraphCount: 2 },
    { oldLessonId: 'lesson-v3', newLessonId: 'lesson-v4', paragraphCount: 2 },
  ])
})

test('repair mapping rejects an archived lesson whose paragraph layout is incompatible', () => {
  const courses = [{
    status: 'archived',
    lessons: [{ id: 'lesson-v1', order: 1, contentJson: JSON.stringify({ paragraphs: [{ sceneTitle: 'one' }] }) }],
  }]

  assert.throws(() => buildHistoricalLessonMappings(courses, [
    { oldLessonId: 'lesson-v2', newLessonId: 'lesson-v3', order: 1, paragraphCount: 2 },
  ]), /incompatible paragraph count/)
})

test('repair migration moves history from multiple course versions and is idempotent', async () => {
  const { prisma, state } = createRepairFake()
  const olderFields = {
    userId: 'user-2',
    completionId: 'completion-older',
    completionDate: new Date('2025-01-02T00:00:00.000Z'),
    createdAt: new Date('2025-01-03T00:00:00.000Z'),
  }
  state.paragraphCompletions.push({ id: 'paragraph-older', lessonId: 'archived-lesson', paragraphIndex: 0, ...olderFields })
  state.stepCompletions.push({ id: 'step-older', lessonId: 'archived-lesson', step: 1, ...olderFields })
  state.lessonCompletions.push({ id: 'lesson-older', lessonId: 'archived-lesson', ...olderFields })
  state.bookmarks.push({ id: 'bookmark-older', userId: 'user-2', lessonId: 'archived-lesson', paragraphIndex: 0, createdAt: olderFields.createdAt })
  const allVersionMappings = [
    ...mappings,
    { oldLessonId: 'archived-lesson', newLessonId: 'new-lesson', paragraphCount: 2 },
  ]

  const firstCounts = await migrateClonedLessonHistory(prisma, allVersionMappings)
  const afterFirstRun = structuredClone(state)
  const secondCounts = await migrateClonedLessonHistory(prisma, allVersionMappings)

  assert.deepEqual(firstCounts, {
    paragraphCompletions: 2,
    stepCompletions: 2,
    lessonCompletions: 2,
    paragraphBookmarks: 2,
    paragraphBookmarksMerged: 0,
  })
  assert.equal(state.paragraphCompletions.find((row) => row.id === 'paragraph-older').lessonId, 'new-lesson')
  assert.deepEqual(secondCounts, {
    paragraphCompletions: 0,
    stepCompletions: 0,
    lessonCompletions: 0,
    paragraphBookmarks: 0,
    paragraphBookmarksMerged: 0,
  })
  assert.deepEqual(state, afterFirstRun)
})

test('repair migration rejects paragraph records missing from cloned lesson content before writing', async () => {
  const { prisma, state } = createRepairFake({ invalidParagraph: true })
  const before = structuredClone(state)

  await assert.rejects(migrateClonedLessonHistory(prisma, mappings), /paragraph 2 does not exist/)

  assert.deepEqual(state, before)
})

test('repair migration deliberately merges a bookmark collision into the earliest record', async () => {
  const { prisma, state } = createRepairFake({ bookmarkConflict: true })
  state.bookmarks[0].createdAt = new Date('2026-08-01T00:00:00.000Z')
  state.bookmarks[1].createdAt = new Date('2026-08-02T00:00:00.000Z')

  const counts = await migrateClonedLessonHistory(prisma, mappings)

  assert.equal(state.bookmarks.length, 1)
  assert.equal(state.bookmarks[0].id, 'bookmark-1')
  assert.equal(state.bookmarks[0].lessonId, 'new-lesson')
  assert.equal(state.bookmarks[0].createdAt.toISOString(), '2026-08-01T00:00:00.000Z')
  assert.equal(counts.paragraphBookmarksMerged, 1)
})

test('repair migration keeps an earlier target bookmark when merging a collision', async () => {
  const { prisma, state } = createRepairFake({ bookmarkConflict: true })
  state.bookmarks[0].createdAt = new Date('2026-08-02T00:00:00.000Z')
  state.bookmarks[1].createdAt = new Date('2026-08-01T00:00:00.000Z')

  const counts = await migrateClonedLessonHistory(prisma, mappings)

  assert.equal(state.bookmarks.length, 1)
  assert.equal(state.bookmarks[0].id, 'bookmark-2')
  assert.equal(state.bookmarks[0].createdAt.toISOString(), '2026-08-01T00:00:00.000Z')
  assert.equal(counts.paragraphBookmarksMerged, 1)
})
