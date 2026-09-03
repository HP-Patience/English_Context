import type { StoryCompletionPayload } from './story-completion-api'
import type { StoryFirstPassStep } from './story-progress'

type LegacyProgressRow = {
  readonly status: string
  readonly step1CompletedAt: Date | string | null
  readonly step2CompletedAt: Date | string | null
  readonly step3CompletedAt: Date | string | null
  readonly completedAt: Date | string | null
}

type ProjectionClient = {
  readonly userStoryProgress: {
    readonly findUnique: (args: unknown) => Promise<LegacyProgressRow | null>
    readonly upsert: (args: unknown) => Promise<unknown>
  }
}

type ProjectionParams = {
  readonly userId: string
  readonly lessonId: string
  readonly payload: StoryCompletionPayload
}

type StepDateRow = {
  readonly step: number
  readonly completionDate: Date | string
}

export async function projectLegacyStep(
  client: ProjectionClient,
  params: ProjectionParams,
  step: StoryFirstPassStep,
): Promise<void> {
  const where = { userId_lessonId: { userId: params.userId, lessonId: params.lessonId } }
  const existing = await client.userStoryProgress.findUnique({ where })
  const date = new Date(`${params.payload.date}T00:00:00.000Z`)
  const step1CompletedAt = existing?.step1CompletedAt ?? (step === 1 ? date : null)
  const step2CompletedAt = existing?.step2CompletedAt ?? (step === 2 ? date : null)
  const step3CompletedAt = existing?.step3CompletedAt ?? (step === 3 ? date : null)
  const reviewStatus = existing?.status === 'reviewing' || existing?.status === 'reinforced'
  const status = reviewStatus ? existing.status : step3CompletedAt ? 'first_passed' : 'learning'
  const currentStep = step3CompletedAt ? 4 : !step1CompletedAt ? 1 : !step2CompletedAt ? 2 : 3
  const data = {
    userId: params.userId,
    lessonId: params.lessonId,
    currentStep,
    status,
    step1CompletedAt,
    step2CompletedAt,
    step3CompletedAt,
    completedAt: existing?.completedAt ?? (step === 3 ? date : null),
  }
  await client.userStoryProgress.upsert({ where, create: data, update: data })
}

export async function syncLegacyStepProjection(
  client: ProjectionClient,
  params: { readonly userId: string; readonly lessonId: string },
  rows: readonly StepDateRow[],
): Promise<void> {
  const where = { userId_lessonId: { userId: params.userId, lessonId: params.lessonId } }
  const existing = await client.userStoryProgress.findUnique({ where })
  const firstDate = (step: StoryFirstPassStep) => rows
    .filter((row) => row.step === step)
    .map((row) => row.completionDate instanceof Date ? row.completionDate : new Date(row.completionDate))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  const step1CompletedAt = firstDate(1)
  const step2CompletedAt = firstDate(2)
  const step3CompletedAt = firstDate(3)
  const reviewStatus = step3CompletedAt && (existing?.status === 'reviewing' || existing?.status === 'reinforced')
  const status = reviewStatus
    ? existing.status
    : step3CompletedAt
      ? 'first_passed'
      : step1CompletedAt || step2CompletedAt
        ? 'learning'
        : 'not_started'
  const currentStep = step3CompletedAt ? 4 : !step1CompletedAt ? 1 : !step2CompletedAt ? 2 : 3
  const data = {
    userId: params.userId,
    lessonId: params.lessonId,
    currentStep,
    status,
    step1CompletedAt,
    step2CompletedAt,
    step3CompletedAt,
    completedAt: step3CompletedAt,
  }
  await client.userStoryProgress.upsert({ where, create: data, update: data })
}
