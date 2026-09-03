import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { recordStepCompletion } from './story-completion'

type Progress = {
  readonly status: string
  readonly currentStep: number
  readonly step1CompletedAt: Date | null
  readonly step2CompletedAt: Date | null
  readonly step3CompletedAt: Date | null
  readonly completedAt: Date | null
}

type ProgressUpsert = {
  readonly create: Progress
  readonly update: Progress
}

type StepUpsert = {
  readonly create: {
    readonly userId: string
    readonly lessonId: string
    readonly completionId: string
    readonly completionDate: Date
    readonly step: number
  }
}

function createConcurrentPrisma(projectionErrors: readonly unknown[] = []) {
  let progress: Progress | null = null
  let transactionTail = Promise.resolve()
  let transactionCount = 0
  let projectionAttempt = 0
  const stepRows: Array<StepUpsert['create'] & { readonly id: string; readonly createdAt: Date }> = []
  const isolationLevels: string[] = []

  const transactionClient = (serializeReads: boolean) => ({
    storyLesson: {
      async findFirst() {
        return { id: 'lesson-1', contentJson: '{}' }
      },
    },
    userStoryStepCompletion: {
      async findMany() {
        return stepRows
      },
      async upsert(args: StepUpsert) {
        const existing = stepRows.find((row) => (
          row.userId === args.create.userId && row.completionId === args.create.completionId
        ))
        if (existing) return existing
        const row = {
          ...args.create,
          id: `step-${stepRows.length + 1}`,
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        }
        stepRows.push(row)
        return row
      },
    },
    userStoryParagraphCompletion: {
      async findMany() { return [] },
      async upsert() { throw new Error('unused') },
    },
    userStoryLessonCompletion: {
      async findMany() { return [] },
      async upsert() { throw new Error('unused') },
    },
    userStoryProgress: {
      async findUnique() {
        const error = projectionErrors[projectionAttempt]
        projectionAttempt += 1
        if (error !== undefined) throw error
        const snapshot = progress === null ? null : structuredClone(progress)
        if (serializeReads) await Promise.resolve()
        return snapshot
      },
      async upsert(args: ProgressUpsert) {
        progress = structuredClone(progress === null ? args.create : args.update)
        return progress
      },
    },
  })

  const prisma = {
    ...transactionClient(false),
    async $transaction<T>(
      callback: (tx: ReturnType<typeof transactionClient>) => Promise<T>,
      options?: { readonly isolationLevel?: string },
    ): Promise<T> {
      transactionCount += 1
      if (options?.isolationLevel !== 'Serializable') {
        return callback(transactionClient(true))
      }
      isolationLevels.push(options.isolationLevel)
      const previous = transactionTail
      let releaseCurrentTransaction: () => void = () => undefined
      transactionTail = new Promise<void>((resolve) => {
        releaseCurrentTransaction = resolve
      })
      await previous
      try {
        return await callback(transactionClient(false))
      } finally {
        releaseCurrentTransaction()
      }
    },
  }

  return {
    prisma,
    state: {
      isolationLevels,
      progress: () => progress,
      stepRows,
      transactionCount: () => transactionCount,
    },
  }
}

describe('concurrent story step projection', () => {
  it.each([
    [[1, '2026-09-01'], [2, '2026-09-02']],
    [[2, '2026-09-02'], [1, '2026-09-01']],
  ] as const)('preserves both legacy timestamps for concurrent completion order %j', async (...steps) => {
    const fixture = createConcurrentPrisma()

    await Promise.all(steps.map(([step, date]) => recordStepCompletion({
      prisma: fixture.prisma,
      userId: 'user-1',
      lessonId: 'lesson-1',
      step,
      payload: { completionId: `step-${step}`, date },
    })))

    expect(fixture.state.stepRows).toHaveLength(2)
    expect(fixture.state.progress()).toMatchObject({
      currentStep: 3,
      step1CompletedAt: new Date('2026-09-01T00:00:00.000Z'),
      step2CompletedAt: new Date('2026-09-02T00:00:00.000Z'),
    })
    expect(fixture.state.isolationLevels).toEqual(['Serializable', 'Serializable'])
  })

  it('retries a real Prisma P2034 without duplicating the history event', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    })
    const fixture = createConcurrentPrisma([conflict])

    await recordStepCompletion({
      prisma: fixture.prisma,
      userId: 'user-1',
      lessonId: 'lesson-1',
      step: 1,
      payload: { completionId: 'step-1', date: '2026-09-01' },
    })

    expect(fixture.state.transactionCount()).toBe(2)
    expect(fixture.state.stepRows).toHaveLength(1)
    expect(fixture.state.progress()?.step1CompletedAt).toEqual(new Date('2026-09-01T00:00:00.000Z'))
  })

  it('does not retry an arbitrary object that only resembles P2034', async () => {
    const fixture = createConcurrentPrisma([{ code: 'P2034' }])

    await expect(recordStepCompletion({
      prisma: fixture.prisma,
      userId: 'user-1',
      lessonId: 'lesson-1',
      step: 1,
      payload: { completionId: 'step-1', date: '2026-09-01' },
    })).rejects.toEqual({ code: 'P2034' })
    expect(fixture.state.transactionCount()).toBe(1)
  })
})
