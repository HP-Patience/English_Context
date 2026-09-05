import type { Prisma } from '@prisma/client'

import type { StoryCompletionSummary } from './story-completion'

type CompletionAggregateRow = {
  readonly lessonId: string
  readonly _count: { readonly _all: number }
  readonly _max: { readonly completionDate: Date | string | null }
}

type ParagraphCompletionAggregateRow = CompletionAggregateRow & {
  readonly paragraphIndex: number
  readonly step: number
}

type CompletionAggregateDelegate<Row> = {
  readonly groupBy: (args: unknown) => Promise<readonly Row[]>
}

export type StoryCompletionSummaryPrisma = {
  readonly userStoryLessonCompletion: CompletionAggregateDelegate<CompletionAggregateRow>
  readonly userStoryStepCompletion: CompletionAggregateDelegate<CompletionAggregateRow>
  readonly userStoryParagraphCompletion: CompletionAggregateDelegate<ParagraphCompletionAggregateRow>
}

type LessonCardCount = {
  readonly lessonId: string
  readonly totalCards: number
}

export async function loadStoryCompletionSummaries({
  prisma,
  userId,
  lessons,
}: {
  readonly prisma: StoryCompletionSummaryPrisma
  readonly userId: string
  readonly lessons: readonly LessonCardCount[]
}): Promise<Readonly<Record<string, StoryCompletionSummary>>> {
  const summaries: Record<string, StoryCompletionSummary> = Object.fromEntries(
    lessons.map(({ lessonId, totalCards }) => [lessonId, emptySummary(totalCards)]),
  )
  if (lessons.length === 0) return summaries

  const lessonIds = lessons.map((lesson) => lesson.lessonId)
  const aggregateFields = {
    where: { userId, lessonId: { in: lessonIds } },
    _count: { _all: true as const },
    _max: { completionDate: true as const },
  }
  const lessonQuery = {
    by: ['lessonId'],
    ...aggregateFields,
  } satisfies Prisma.UserStoryLessonCompletionGroupByArgs
  const stepQuery = {
    by: ['lessonId'],
    ...aggregateFields,
  } satisfies Prisma.UserStoryStepCompletionGroupByArgs
  const paragraphQuery = {
    by: ['lessonId', 'step', 'paragraphIndex'],
    ...aggregateFields,
  } satisfies Prisma.UserStoryParagraphCompletionGroupByArgs
  const [lessonRows, stepRows, paragraphRows] = await Promise.all([
    prisma.userStoryLessonCompletion.groupBy(lessonQuery),
    prisma.userStoryStepCompletion.groupBy(stepQuery),
    prisma.userStoryParagraphCompletion.groupBy(paragraphQuery),
  ])

  for (const row of lessonRows) {
    const summary = summaries[row.lessonId]
    if (summary) summaries[row.lessonId] = { ...summary, lesson: aggregateSummary(row) }
  }
  for (const row of stepRows) {
    const summary = summaries[row.lessonId]
    if (summary) summaries[row.lessonId] = { ...summary, step: aggregateSummary(row) }
  }
  for (const row of paragraphRows) {
    const summary = summaries[row.lessonId]
    if (!summary) continue
    const step = row.step === 2 ? 2 : 1
    const stepSummary = summary.paragraphByStep?.[step]
    if (!stepSummary) continue
    summaries[row.lessonId] = {
      ...summary,
      paragraph: step === 1 ? {
        ...summary.paragraph,
        count: summary.paragraph.count + row._count._all,
        latestDate: laterDate(summary.paragraph.latestDate, dateOnly(row._max.completionDate)),
        completedCards: summary.paragraph.completedCards + 1,
      } : summary.paragraph,
      paragraphByStep: {
        ...summary.paragraphByStep,
        [step]: {
          count: stepSummary.count + row._count._all,
          latestDate: laterDate(stepSummary.latestDate, dateOnly(row._max.completionDate)),
          completedCards: stepSummary.completedCards + 1,
          completedParagraphIndexes: [...stepSummary.completedParagraphIndexes, row.paragraphIndex],
        },
      },
    }
  }
  return summaries
}

function aggregateSummary(row: CompletionAggregateRow): { readonly count: number; readonly latestDate: string | null } {
  return { count: row._count._all, latestDate: dateOnly(row._max.completionDate) }
}

function emptySummary(totalCards: number): StoryCompletionSummary {
  const emptyStep = () => ({ count: 0, latestDate: null, completedCards: 0, completedParagraphIndexes: [] })
  return {
    lesson: { count: 0, latestDate: null },
    step: { count: 0, latestDate: null },
    paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards },
    paragraphByStep: { 1: emptyStep(), 2: emptyStep() },
  }
}

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10)
}

function laterDate(left: string | null, right: string | null): string | null {
  if (left === null) return right
  if (right === null) return left
  return left > right ? left : right
}
