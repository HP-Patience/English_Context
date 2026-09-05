import { describe, expect, it } from 'vitest'

import {
  recordParagraphCompletion,
  recordStepCompletion,
  summarizeStoryCompletions,
} from './story-completion'
import { STORY_ERROR_CODES } from './story-errors'

type CompletionRow = {
  id: string
  completionId: string
  userId: string
  lessonId: string
  completionDate: Date
  createdAt: Date
  paragraphIndex?: number
  step?: number
}

type UpsertArgs = {
  where: { userId_completionId: { userId: string; completionId: string } }
  create: {
    userId: string
    lessonId: string
    completionId: string
    completionDate: Date
    paragraphIndex?: number
    step?: number
  }
}

function contentJson(): string {
  return JSON.stringify({
    title: 'Ready lesson',
    order: 1,
    sourceChapterStart: 'one',
    sourceChapterEnd: 'two',
    sourceSummary: 'summary',
    continuityNotes: 'notes',
    paragraphs: [
      { sceneTitle: 'first', segments: [{ type: 'text', value: 'first paragraph' }] },
      { sceneTitle: 'second', segments: [{ type: 'text', value: 'second paragraph' }] },
    ],
  })
}

function createCompletionPrisma() {
  const paragraphRows: CompletionRow[] = []
  const stepRows: CompletionRow[] = []
  const legacyUpdates: unknown[] = []
  let nextId = 1

  const upsert = (rows: CompletionRow[]) => async (args: UpsertArgs) => {
    const existing = rows.find((row) => (
      row.userId === args.where.userId_completionId.userId &&
      row.completionId === args.where.userId_completionId.completionId
    ))
    if (existing) return structuredClone(existing)
    const row: CompletionRow = {
      id: `completion-${nextId++}`,
      ...structuredClone(args.create),
      createdAt: new Date(`2026-09-02T00:00:0${nextId}.000Z`),
    }
    rows.push(row)
    return structuredClone(row)
  }

  return {
    state: { paragraphRows, stepRows, legacyUpdates },
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      return callback(this)
    },
    storyLesson: {
      async findFirst() {
        return { id: 'lesson-1', contentJson: contentJson() }
      },
    },
    userStoryParagraphCompletion: {
      async findMany() { return structuredClone(paragraphRows) },
      upsert: upsert(paragraphRows),
    },
    userStoryStepCompletion: {
      async findMany() { return structuredClone(stepRows) },
      upsert: upsert(stepRows),
    },
    userStoryLessonCompletion: {
      async findMany() { return [] },
      async upsert() { throw new Error('not used by this test') },
    },
    userStoryProgress: {
      async findUnique() { return null },
      async upsert(args: unknown) {
        legacyUpdates.push(structuredClone(args))
        return args
      },
    },
  }
}

describe('story completion persistence', () => {
  it('is idempotent by completionId while allowing the same date under distinct ids', async () => {
    const prisma = createCompletionPrisma()
    const base = { prisma, userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 0, step: 1 as const }

    const first = await recordParagraphCompletion({
      ...base,
      payload: { completionId: 'client-1', date: '2026-09-01' },
    })
    const replay = await recordParagraphCompletion({
      ...base,
      payload: { completionId: 'client-1', date: '2026-09-01' },
    })
    await recordParagraphCompletion({
      ...base,
      payload: { completionId: 'client-2', date: '2026-09-01' },
    })

    expect(replay).toEqual(first)
    expect(prisma.state.paragraphRows).toHaveLength(2)
  })

  it('isolates paragraph records by step and treats an omitted step as Step 1', async () => {
    const prisma = createCompletionPrisma()
    const base = { prisma, userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 0 }

    await recordParagraphCompletion({
      ...base,
      payload: { completionId: 'legacy-client', date: '2026-09-01' },
    })
    await recordParagraphCompletion({
      ...base,
      step: 2,
      payload: { completionId: 'recall-client', date: '2026-09-02' },
    })

    expect(prisma.state.paragraphRows).toEqual([
      expect.objectContaining({ completionId: 'legacy-client', step: 1 }),
      expect.objectContaining({ completionId: 'recall-client', step: 2 }),
    ])
  })

  it('rejects a paragraph index outside immutable ready lesson content', async () => {
    const prisma = createCompletionPrisma()

    await expect(recordParagraphCompletion({
      prisma,
      userId: 'user-1',
      lessonId: 'lesson-1',
      paragraphIndex: 2,
      payload: { completionId: 'client-1', date: '2026-09-01' },
    })).rejects.toMatchObject({ code: STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND })
    expect(prisma.state.paragraphRows).toHaveLength(0)
  })

  it('rejects reuse of a completionId for a different immutable event', async () => {
    const prisma = createCompletionPrisma()
    const base = { prisma, userId: 'user-1', lessonId: 'lesson-1', paragraphIndex: 0, step: 1 as const }
    await recordParagraphCompletion({ ...base, payload: { completionId: 'client-1', date: '2026-09-01' } })

    await expect(recordParagraphCompletion({
      ...base,
      payload: { completionId: 'client-1', date: '2026-09-02' },
    })).rejects.toMatchObject({ code: STORY_ERROR_CODES.COMPLETION_ID_CONFLICT })
    expect(prisma.state.paragraphRows).toHaveLength(1)
  })

  it('projects a Step 3 event to legacy progress so Step 4 eligibility remains unchanged', async () => {
    const prisma = createCompletionPrisma()

    await recordStepCompletion({
      prisma,
      userId: 'user-1',
      lessonId: 'lesson-1',
      step: 3,
      payload: { completionId: 'step-3-client-1', date: '2026-09-01' },
    })

    expect(prisma.state.legacyUpdates).toEqual([
      expect.objectContaining({
        create: expect.objectContaining({
          currentStep: 4,
          status: 'first_passed',
          step3CompletedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      }),
    ])
  })
})

describe('story completion summaries', () => {
  it('counts all events but counts distinct completed paragraph cards', () => {
    const createdAt = new Date('2026-09-02T00:00:00.000Z')
    const row = (id: string, date: string, paragraphIndex: number) => ({
      id,
      completionId: `client-${id}`,
      userId: 'user-1',
      lessonId: 'lesson-1',
      completionDate: new Date(`${date}T00:00:00.000Z`),
      createdAt,
      paragraphIndex,
    })

    expect(summarizeStoryCompletions({
      lessonCompletions: [row('lesson', '2026-08-30', 0)],
      stepCompletions: [
        { ...row('step-1', '2026-08-31', 0), step: 1 },
        { ...row('step-2', '2026-09-01', 0), step: 2 },
      ],
      paragraphCompletions: [
        row('paragraph-1', '2026-08-30', 0),
        row('paragraph-2', '2026-09-01', 0),
        row('paragraph-3', '2026-08-31', 1),
      ],
      totalCards: 4,
    })).toEqual({
      lesson: { count: 1, latestDate: '2026-08-30' },
      step: { count: 2, latestDate: '2026-09-01' },
      paragraph: { count: 3, latestDate: '2026-09-01', completedCards: 2, totalCards: 4 },
    })
  })
})
