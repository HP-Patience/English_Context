import { Prisma } from '@prisma/client'

import { STORY_ERROR_CODES, StoryDomainError } from './story-errors'
import { parseStoryContent } from './story-types'
import { projectLegacyStep, syncLegacyStepProjection } from './story-completion-projection'
import type { StoryCompletionPayload, StoryCompletionUpdatePayload } from './story-completion-api'
import type { StoryFirstPassStep } from './story-progress'

const READY_STATUS = 'ready'
const READY_COURSE_SLOT = 'ready'

export type StoryCompletionEvent = {
  readonly id: string
  readonly completionId: string
  readonly date: string
  readonly createdAt: string
}

export type StoryCompletionSummary = {
  readonly lesson: { readonly count: number; readonly latestDate: string | null }
  readonly step: { readonly count: number; readonly latestDate: string | null }
  readonly paragraph: {
    readonly count: number
    readonly latestDate: string | null
    readonly completedCards: number
    readonly totalCards: number
  }
}

type CompletionSummaryRow = {
  readonly id: string
  readonly completionId: string
  readonly completionDate: Date | string
  readonly createdAt: Date | string
}

type CompletionRow = CompletionSummaryRow & { readonly userId: string; readonly lessonId: string }
type ParagraphCompletionRow = CompletionRow & { readonly paragraphIndex: number }
type StepCompletionRow = CompletionRow & { readonly step: number }
type ParagraphCompletionSummaryRow = CompletionSummaryRow & { readonly paragraphIndex: number }
type StepCompletionSummaryRow = CompletionSummaryRow & { readonly step: number }
type ReadyLessonRow = { readonly id: string; readonly contentJson: string }
type CompletionDelegate<Row extends CompletionRow> = {
  findMany(args: unknown): Promise<readonly Row[]>
  findFirst(args: unknown): Promise<Row | null>
  upsert(args: unknown): Promise<Row>
  updateMany(args: unknown): Promise<{ readonly count: number }>
  deleteMany(args: unknown): Promise<{ readonly count: number }>
}

type InternalPrismaClient = {
  $transaction<T>(
    callback: (tx: InternalPrismaClient) => Promise<T>,
    options?: { readonly isolationLevel: 'Serializable'; readonly maxWait: number; readonly timeout: number },
  ): Promise<T>
  storyLesson: { findFirst(args: unknown): Promise<ReadyLessonRow | null> }
  userStoryParagraphCompletion: CompletionDelegate<ParagraphCompletionRow>
  userStoryStepCompletion: CompletionDelegate<StepCompletionRow>
  userStoryLessonCompletion: CompletionDelegate<CompletionRow>
  userStoryProgress: {
    findUnique(args: unknown): Promise<{
      readonly status: string
      readonly step1CompletedAt: Date | string | null
      readonly step2CompletedAt: Date | string | null
      readonly step3CompletedAt: Date | string | null
      readonly completedAt: Date | string | null
    } | null>
    upsert(args: unknown): Promise<unknown>
  }
}

type CompletionParams = {
  readonly prisma: unknown
  readonly userId: string
  readonly lessonId: string
}

type RecordCompletionParams = CompletionParams & { readonly payload: StoryCompletionPayload }

export async function listLessonCompletions(params: CompletionParams): Promise<readonly StoryCompletionEvent[]> {
  const client = asPrisma(params.prisma)
  await requireReadyLesson(client, params.lessonId)
  return mapEvents(await client.userStoryLessonCompletion.findMany(historyQuery(params)))
}

export async function recordLessonCompletion(params: RecordCompletionParams): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  await requireReadyLesson(client, params.lessonId)
  const row = await client.userStoryLessonCompletion.upsert(eventUpsert(params, {}))
  requireMatchingEvent(row, params)
  return toEvent(row)
}

export async function updateLessonCompletion(
  params: CompletionParams & { readonly payload: StoryCompletionUpdatePayload },
): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  await requireReadyLesson(client, params.lessonId)
  const where = lessonEventWhere(params, params.payload.id)
  const updated = await client.userStoryLessonCompletion.updateMany({
    where,
    data: { completionDate: new Date(`${params.payload.date}T00:00:00.000Z`) },
  })
  if (updated.count !== 1) throw lessonCompletionNotFound(params.lessonId, params.payload.id)
  const row = await client.userStoryLessonCompletion.findFirst({ where })
  if (!row) throw lessonCompletionNotFound(params.lessonId, params.payload.id)
  return toEvent(row)
}

export async function deleteLessonCompletion(
  params: CompletionParams & { readonly completionEventId: string },
): Promise<void> {
  const client = asPrisma(params.prisma)
  await requireReadyLesson(client, params.lessonId)
  const deleted = await client.userStoryLessonCompletion.deleteMany({
    where: lessonEventWhere(params, params.completionEventId),
  })
  if (deleted.count !== 1) throw lessonCompletionNotFound(params.lessonId, params.completionEventId)
}

export async function listStepCompletions(
  params: CompletionParams & { readonly step: StoryFirstPassStep },
): Promise<readonly StoryCompletionEvent[]> {
  const client = asPrisma(params.prisma)
  await requireReadyLesson(client, params.lessonId)
  return mapEvents(await client.userStoryStepCompletion.findMany(historyQuery(params, { step: params.step })))
}

export async function recordStepCompletion(
  params: RecordCompletionParams & { readonly step: StoryFirstPassStep },
): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  return runSerializableTransaction(client, async (tx) => {
    await requireReadyLesson(tx, params.lessonId)
    const row = await tx.userStoryStepCompletion.upsert(eventUpsert(params, { step: params.step }))
    requireMatchingEvent(row, params, { step: params.step })
    await projectLegacyStep(tx, params, params.step)
    return toEvent(row)
  })
}

export async function updateStepCompletion(
  params: CompletionParams & {
    readonly step: StoryFirstPassStep
    readonly payload: StoryCompletionUpdatePayload
  },
): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  return runSerializableTransaction(client, async (tx) => {
    await requireReadyLesson(tx, params.lessonId)
    const where = stepEventWhere(params, params.payload.id)
    const updated = await tx.userStoryStepCompletion.updateMany({
      where,
      data: { completionDate: new Date(`${params.payload.date}T00:00:00.000Z`) },
    })
    if (updated.count !== 1) throw stepCompletionNotFound(params.lessonId, params.step, params.payload.id)
    const row = await tx.userStoryStepCompletion.findFirst({ where })
    if (!row) throw stepCompletionNotFound(params.lessonId, params.step, params.payload.id)
    await rebuildStepProjection(tx, params)
    return toEvent(row)
  })
}

export async function deleteStepCompletion(
  params: CompletionParams & { readonly step: StoryFirstPassStep; readonly completionEventId: string },
): Promise<void> {
  const client = asPrisma(params.prisma)
  await runSerializableTransaction(client, async (tx) => {
    await requireReadyLesson(tx, params.lessonId)
    const deleted = await tx.userStoryStepCompletion.deleteMany({
      where: stepEventWhere(params, params.completionEventId),
    })
    if (deleted.count !== 1) throw stepCompletionNotFound(params.lessonId, params.step, params.completionEventId)
    await rebuildStepProjection(tx, params)
  })
}

export async function listParagraphCompletions(
  params: CompletionParams & { readonly paragraphIndex: number },
): Promise<readonly StoryCompletionEvent[]> {
  const client = asPrisma(params.prisma)
  await requireParagraph(client, params.lessonId, params.paragraphIndex)
  return mapEvents(await client.userStoryParagraphCompletion.findMany(
    historyQuery(params, { paragraphIndex: params.paragraphIndex }),
  ))
}

export async function recordParagraphCompletion(
  params: RecordCompletionParams & { readonly paragraphIndex: number },
): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  await requireParagraph(client, params.lessonId, params.paragraphIndex)
  const dimensions = { paragraphIndex: params.paragraphIndex }
  const row = await client.userStoryParagraphCompletion.upsert(eventUpsert(params, dimensions))
  requireMatchingEvent(row, params, dimensions)
  return toEvent(row)
}

export async function updateParagraphCompletion(
  params: CompletionParams & { readonly paragraphIndex: number; readonly payload: StoryCompletionUpdatePayload },
): Promise<StoryCompletionEvent> {
  const client = asPrisma(params.prisma)
  await requireParagraph(client, params.lessonId, params.paragraphIndex)
  const where = paragraphEventWhere(params, params.payload.id)
  const updated = await client.userStoryParagraphCompletion.updateMany({
    where,
    data: { completionDate: new Date(`${params.payload.date}T00:00:00.000Z`) },
  })
  if (updated.count !== 1) throw paragraphCompletionNotFound(params.lessonId, params.paragraphIndex, params.payload.id)
  const row = await client.userStoryParagraphCompletion.findFirst({ where })
  if (!row) throw paragraphCompletionNotFound(params.lessonId, params.paragraphIndex, params.payload.id)
  return toEvent(row)
}

export async function deleteParagraphCompletion(
  params: CompletionParams & { readonly paragraphIndex: number; readonly completionEventId: string },
): Promise<void> {
  const client = asPrisma(params.prisma)
  await requireParagraph(client, params.lessonId, params.paragraphIndex)
  const deleted = await client.userStoryParagraphCompletion.deleteMany({
    where: paragraphEventWhere(params, params.completionEventId),
  })
  if (deleted.count !== 1) {
    throw paragraphCompletionNotFound(params.lessonId, params.paragraphIndex, params.completionEventId)
  }
}

export function summarizeStoryCompletions(input: {
  readonly lessonCompletions?: readonly CompletionSummaryRow[]
  readonly stepCompletions?: readonly StepCompletionSummaryRow[]
  readonly paragraphCompletions?: readonly ParagraphCompletionSummaryRow[]
  readonly totalCards: number
}): StoryCompletionSummary {
  const lesson = input.lessonCompletions ?? []
  const step = input.stepCompletions ?? []
  const paragraph = input.paragraphCompletions ?? []
  return {
    lesson: { count: lesson.length, latestDate: latestDate(lesson) },
    step: { count: step.length, latestDate: latestDate(step) },
    paragraph: {
      count: paragraph.length,
      latestDate: latestDate(paragraph),
      completedCards: new Set(paragraph.map((row) => row.paragraphIndex)).size,
      totalCards: input.totalCards,
    },
  }
}

async function requireReadyLesson(client: InternalPrismaClient, lessonId: string): Promise<ReadyLessonRow> {
  const lesson = await client.storyLesson.findFirst({
    where: { id: lessonId, status: READY_STATUS, course: { readySlot: READY_COURSE_SLOT, status: READY_STATUS } },
    select: { id: true, contentJson: true },
  })
  if (lesson) return lesson
  throw new StoryDomainError(STORY_ERROR_CODES.LESSON_NOT_FOUND, `Story lesson is not ready or does not exist: ${lessonId}`)
}

async function requireParagraph(client: InternalPrismaClient, lessonId: string, paragraphIndex: number): Promise<void> {
  const lesson = await requireReadyLesson(client, lessonId)
  const paragraphCount = parseStoryContent(lesson.contentJson).paragraphs.length
  if (Number.isInteger(paragraphIndex) && paragraphIndex >= 0 && paragraphIndex < paragraphCount) return
  throw new StoryDomainError(STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND, `Story paragraph does not exist: ${lessonId}/${paragraphIndex}`)
}

function historyQuery(params: CompletionParams, dimensions: Readonly<Record<string, number>> = {}) {
  return {
    where: { userId: params.userId, lessonId: params.lessonId, ...dimensions },
    orderBy: [{ completionDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  }
}

function eventUpsert(params: RecordCompletionParams, dimensions: Readonly<Record<string, number>>) {
  const data = {
    userId: params.userId,
    lessonId: params.lessonId,
    completionId: params.payload.completionId,
    completionDate: new Date(`${params.payload.date}T00:00:00.000Z`),
    ...dimensions,
  }
  return {
    where: { userId_completionId: { userId: params.userId, completionId: params.payload.completionId } },
    create: data,
    update: {},
  }
}

function paragraphEventWhere(
  params: CompletionParams & { readonly paragraphIndex: number },
  id: string,
) {
  return {
    id,
    userId: params.userId,
    lessonId: params.lessonId,
    paragraphIndex: params.paragraphIndex,
  }
}

function lessonEventWhere(params: CompletionParams, id: string) {
  return { id, userId: params.userId, lessonId: params.lessonId }
}

function stepEventWhere(
  params: CompletionParams & { readonly step: StoryFirstPassStep },
  id: string,
) {
  return { id, userId: params.userId, lessonId: params.lessonId, step: params.step }
}

async function rebuildStepProjection(
  client: InternalPrismaClient,
  params: CompletionParams,
): Promise<void> {
  const rows = await client.userStoryStepCompletion.findMany({
    where: { userId: params.userId, lessonId: params.lessonId },
    select: { step: true, completionDate: true },
  })
  await syncLegacyStepProjection(client, params, rows)
}

function lessonCompletionNotFound(lessonId: string, id: string): StoryDomainError {
  return new StoryDomainError(
    STORY_ERROR_CODES.LESSON_NOT_FOUND,
    `Story lesson completion does not exist: ${lessonId}/${id}`,
  )
}

function stepCompletionNotFound(lessonId: string, step: StoryFirstPassStep, id: string): StoryDomainError {
  return new StoryDomainError(
    STORY_ERROR_CODES.LESSON_NOT_FOUND,
    `Story step completion does not exist: ${lessonId}/${step}/${id}`,
  )
}

function paragraphCompletionNotFound(lessonId: string, paragraphIndex: number, id: string): StoryDomainError {
  return new StoryDomainError(
    STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND,
    `Story paragraph completion does not exist: ${lessonId}/${paragraphIndex}/${id}`,
  )
}

function requireMatchingEvent(
  row: CompletionRow & Partial<ParagraphCompletionRow & StepCompletionRow>,
  params: RecordCompletionParams,
  dimensions: Readonly<Record<string, number>> = {},
): void {
  const paragraphIndex = dimensions['paragraphIndex']
  const step = dimensions['step']
  const matchesParagraph = paragraphIndex === undefined || row.paragraphIndex === paragraphIndex
  const matchesStep = step === undefined || row.step === step
  if (
    row.lessonId === params.lessonId &&
    dateOnly(row.completionDate) === params.payload.date &&
    matchesParagraph &&
    matchesStep
  ) return
  throw new StoryDomainError(STORY_ERROR_CODES.COMPLETION_ID_CONFLICT, `Completion id was already used: ${params.payload.completionId}`)
}

function mapEvents(rows: readonly CompletionRow[]): readonly StoryCompletionEvent[] {
  return rows.map(toEvent)
}

function toEvent(row: CompletionRow): StoryCompletionEvent {
  return { id: row.id, completionId: row.completionId, date: dateOnly(row.completionDate), createdAt: toIso(row.createdAt) }
}

function latestDate(rows: readonly CompletionSummaryRow[]): string | null {
  return rows.reduce<string | null>((latest, row) => {
    const date = dateOnly(row.completionDate)
    return latest === null || date > latest ? date : latest
  }, null)
}

function dateOnly(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10)
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function asPrisma(value: unknown): InternalPrismaClient {
  return value as InternalPrismaClient
}

async function runSerializableTransaction<T>(
  client: InternalPrismaClient,
  callback: (tx: InternalPrismaClient) => Promise<T>,
): Promise<T> {
  const retryLimit = 3
  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    try {
      return await client.$transaction(callback, {
        isolationLevel: 'Serializable',
        maxWait: 5_000,
        timeout: 10_000,
      })
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === retryLimit) throw error
    }
  }
  throw new TypeError('Serializable transaction retry limit was not applied')
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}
