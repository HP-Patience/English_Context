import { parseStoryContent } from './story-types'
import { STORY_ERROR_CODES, StoryDomainError } from './story-errors'

const READY_STATUS = 'ready'
const READY_COURSE_SLOT = 'ready'

export type StoryCardBookmark = {
  readonly type: 'storyCard'
  readonly id: string
  readonly lessonId: string
  readonly lessonOrder: number
  readonly lessonTitle: string
  readonly paragraphIndex: number
  readonly sceneTitle: string
  readonly createdAt: Date | string
}

type PersistedBookmarkRow = {
  readonly id: string
  readonly lessonId: string
  readonly paragraphIndex: number
  readonly createdAt: Date | string
}

type BookmarkRow = PersistedBookmarkRow & {
  readonly lesson: {
    readonly order: number
    readonly title: string
    readonly contentJson: string
  }
}

type LessonRow = {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly contentJson: string
}

type InternalPrismaClient = {
  storyLesson: { findFirst(args: unknown): Promise<LessonRow | null> }
  userStoryParagraphBookmark: {
    findMany(args: unknown): Promise<readonly BookmarkRow[]>
    upsert(args: unknown): Promise<PersistedBookmarkRow>
    deleteMany(args: unknown): Promise<{ readonly count: number }>
  }
}

export async function listStoryCardBookmarks(params: {
  readonly prisma: unknown
  readonly userId: string
}): Promise<readonly StoryCardBookmark[]> {
  const client = asPrisma(params.prisma)
  const rows = await client.userStoryParagraphBookmark.findMany({
    where: { userId: params.userId, lesson: { status: READY_STATUS, course: { readySlot: READY_COURSE_SLOT, status: READY_STATUS } } },
    include: { lesson: { select: { order: true, title: true, contentJson: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
  return rows.map(toBookmark)
}

export async function setStoryCardBookmark(params: {
  readonly prisma: unknown
  readonly userId: string
  readonly lessonId: string
  readonly paragraphIndex: number
  readonly bookmarked: boolean
}): Promise<{ readonly bookmarked: boolean; readonly bookmark: StoryCardBookmark | null }> {
  const client = asPrisma(params.prisma)
  const lesson = await requireParagraph(client, params.lessonId, params.paragraphIndex)
  const where = {
    userId_lessonId_paragraphIndex: {
      userId: params.userId,
      lessonId: params.lessonId,
      paragraphIndex: params.paragraphIndex,
    },
  }
  if (!params.bookmarked) {
    await client.userStoryParagraphBookmark.deleteMany({
      where: {
        userId: params.userId,
        lessonId: params.lessonId,
        paragraphIndex: params.paragraphIndex,
      },
    })
    return { bookmarked: false, bookmark: null }
  }
  const row = await client.userStoryParagraphBookmark.upsert({
    where,
    create: { userId: params.userId, lessonId: params.lessonId, paragraphIndex: params.paragraphIndex },
    update: {},
  })
  return { bookmarked: true, bookmark: toBookmark({ ...row, lesson }) }
}

async function requireParagraph(client: InternalPrismaClient, lessonId: string, paragraphIndex: number): Promise<LessonRow> {
  const lesson = await client.storyLesson.findFirst({
    where: { id: lessonId, status: READY_STATUS, course: { readySlot: READY_COURSE_SLOT, status: READY_STATUS } },
    select: { id: true, order: true, title: true, contentJson: true },
  })
  if (!lesson) throw new StoryDomainError(STORY_ERROR_CODES.LESSON_NOT_FOUND, `Story lesson not found: ${lessonId}`)
  if (Number.isInteger(paragraphIndex) && paragraphIndex >= 0 && paragraphIndex < parseStoryContent(lesson.contentJson).paragraphs.length) return lesson
  throw new StoryDomainError(STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND, `Story paragraph does not exist: ${lessonId}/${paragraphIndex}`)
}

function toBookmark(row: BookmarkRow): StoryCardBookmark {
  const paragraph = parseStoryContent(row.lesson.contentJson).paragraphs[row.paragraphIndex]
  if (!paragraph) throw new StoryDomainError(STORY_ERROR_CODES.PARAGRAPH_NOT_FOUND, `Story paragraph does not exist: ${row.lessonId}/${row.paragraphIndex}`)
  return {
    type: 'storyCard',
    id: row.id,
    lessonId: row.lessonId,
    lessonOrder: row.lesson.order,
    lessonTitle: row.lesson.title,
    paragraphIndex: row.paragraphIndex,
    sceneTitle: paragraph.sceneTitle,
    createdAt: row.createdAt,
  }
}

function asPrisma(value: unknown): InternalPrismaClient {
  return value as InternalPrismaClient
}
