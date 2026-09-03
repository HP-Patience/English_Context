import type { Prisma } from '@prisma/client'

import { parseStoryContent } from './story-types'
import type { StoryLessonParagraph } from './story-types'

export const STORY_OFFLINE_SCHEMA_VERSION = 1 as const

const READY_COURSE_SLOT = 'ready'
const READY_STATUS = 'ready'

const readyCourseSnapshotQuery = {
  where: { readySlot: READY_COURSE_SLOT },
  select: {
    version: true,
    status: true,
    readySlot: true,
    lessons: {
      where: { status: READY_STATUS },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        title: true,
        sourceChapterStart: true,
        sourceChapterEnd: true,
        contentJson: true,
        words: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            sortOrder: true,
            glossCn: true,
            word: {
              select: { id: true, text: true, phonetic: true },
            },
            meaning: {
              select: {
                id: true,
                partOfSpeech: true,
                definition: true,
                definitionCn: true,
                example: true,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StoryCourseFindUniqueArgs

type ReadyCourseSnapshotRow = Prisma.StoryCourseGetPayload<typeof readyCourseSnapshotQuery>

type StoryOfflinePrisma = {
  readonly storyCourse: {
    findUnique(args: typeof readyCourseSnapshotQuery): Promise<ReadyCourseSnapshotRow | null>
  }
}

export type StoryOfflineTargetWord = {
  readonly wordOrder: number
  readonly lessonWordId: string
  readonly wordId: string
  readonly meaningId: string
  readonly word: string
  readonly phonetic: string | null
  readonly glossCn: string
  readonly partOfSpeech: string
  readonly definition: string
  readonly definitionCn: string | null
  readonly example: string | null
}

export type StoryOfflineLesson = {
  readonly id: string
  readonly order: number
  readonly title: string
  readonly sourceChapterStart: string
  readonly sourceChapterEnd: string
  readonly paragraphs: readonly StoryLessonParagraph[]
  readonly targetWords: readonly StoryOfflineTargetWord[]
}

export type StoryOfflineSnapshot = {
  readonly schemaVersion: typeof STORY_OFFLINE_SCHEMA_VERSION
  readonly courseVersion: number
  readonly lessons: readonly StoryOfflineLesson[]
}

export class StoryOfflinePublicationError extends Error {
  constructor(readonly courseVersion: number, readonly status: string) {
    super(`Ready story course invariant violated for version ${courseVersion}: ${status}`)
    this.name = 'StoryOfflinePublicationError'
  }
}

export async function getReadyStoryOfflineSnapshot(
  { prisma }: { readonly prisma: StoryOfflinePrisma },
): Promise<StoryOfflineSnapshot | null> {
  const course = await prisma.storyCourse.findUnique(readyCourseSnapshotQuery)
  if (!course) return null
  if (course.status !== READY_STATUS || course.readySlot !== READY_COURSE_SLOT) {
    throw new StoryOfflinePublicationError(course.version, course.status)
  }

  return {
    schemaVersion: STORY_OFFLINE_SCHEMA_VERSION,
    courseVersion: course.version,
    lessons: course.lessons.map((lesson) => ({
      id: lesson.id,
      order: lesson.order,
      title: lesson.title,
      sourceChapterStart: lesson.sourceChapterStart,
      sourceChapterEnd: lesson.sourceChapterEnd,
      paragraphs: parseStoryContent(lesson.contentJson).paragraphs,
      targetWords: lesson.words.map((targetWord) => ({
        wordOrder: targetWord.sortOrder,
        lessonWordId: targetWord.id,
        wordId: targetWord.word.id,
        meaningId: targetWord.meaning.id,
        word: targetWord.word.text,
        phonetic: targetWord.word.phonetic,
        glossCn: targetWord.glossCn,
        partOfSpeech: targetWord.meaning.partOfSpeech,
        definition: targetWord.meaning.definition,
        definitionCn: targetWord.meaning.definitionCn,
        example: targetWord.meaning.example,
      })),
    })),
  }
}
