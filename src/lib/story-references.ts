import { parseStoryContent } from './story-types'

export type StoryReference = {
  readonly lessonId: string
  readonly lessonOrder: number
  readonly lessonTitle: string
  readonly paragraphIndex: number
  readonly sceneTitle: string
  readonly wordOrder: number
}

type LessonWordRow = {
  readonly sortOrder: number
  readonly lesson: {
    readonly id: string
    readonly order: number
    readonly title: string
    readonly contentJson: string
  }
}

type InternalPrismaClient = {
  storyLessonWord: { findMany(args: unknown): Promise<readonly LessonWordRow[]> }
}

export async function listReadyStoryReferences(params: {
  readonly prisma: unknown
  readonly wordId: string
}): Promise<readonly StoryReference[]> {
  const rows = await asPrisma(params.prisma).storyLessonWord.findMany({
    where: {
      wordId: params.wordId,
      lesson: { status: 'ready', course: { status: 'ready', readySlot: 'ready' } },
    },
    include: { lesson: { select: { id: true, order: true, title: true, contentJson: true } } },
    orderBy: [{ lesson: { order: 'asc' } }, { sortOrder: 'asc' }],
  })
  return rows.map((row) => {
    const content = parseStoryContent(row.lesson.contentJson)
    const paragraphIndex = content.paragraphs.findIndex((paragraph) => paragraph.segments.some(
      (segment) => segment.type === 'targetWord' && segment.wordOrder === row.sortOrder,
    ))
    const paragraph = content.paragraphs[paragraphIndex]
    if (!paragraph) throw new StoryReferenceInvariantError(row.lesson.id, row.sortOrder)
    return {
      lessonId: row.lesson.id,
      lessonOrder: row.lesson.order,
      lessonTitle: row.lesson.title,
      paragraphIndex,
      sceneTitle: paragraph.sceneTitle,
      wordOrder: row.sortOrder,
    }
  }).sort((left, right) => left.lessonOrder - right.lessonOrder || left.paragraphIndex - right.paragraphIndex)
}

class StoryReferenceInvariantError extends Error {
  readonly name = 'StoryReferenceInvariantError'

  constructor(readonly lessonId: string, readonly wordOrder: number) {
    super(`Published story lesson ${lessonId} has no paragraph for word order ${wordOrder}`)
  }
}

function asPrisma(value: unknown): InternalPrismaClient {
  return value as InternalPrismaClient
}
