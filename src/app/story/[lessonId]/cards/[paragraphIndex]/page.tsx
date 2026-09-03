import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { StoryCardDetail } from '@/components/story/StoryCardDetail'
import { normalizeStoryIdentifier } from '@/lib/story-api-types'
import { parseStoryParagraphIndex } from '@/lib/story-completion-api'
import { getLocalUserId, prisma } from '@/lib/prisma'
import { getStoryLesson } from '@/lib/story-service'

export const metadata: Metadata = {
  title: '故事段落 — ContextVocab',
  description: '单独阅读故事段落、目标词与完成日期历史。',
}

type StoryCardPageProps = {
  readonly params: Promise<{ readonly lessonId: string; readonly paragraphIndex: string }>
}

export default async function StoryCardPage({ params }: StoryCardPageProps) {
  await connection()
  const values = await params
  const lessonId = normalizeStoryIdentifier(values.lessonId)
  const paragraphIndex = parseStoryParagraphIndex(values.paragraphIndex)
  if (!lessonId || paragraphIndex === null) notFound()

  const userId = await getLocalUserId()
  const lesson = await getStoryLesson({ prisma, userId, lessonId })
  if (!lesson) notFound()
  const paragraph = lesson.content.paragraphs[paragraphIndex]
  if (!paragraph) notFound()

  return (
    <StoryCardDetail
      lessonId={lesson.id}
      lessonOrder={lesson.order}
      lessonTitle={lesson.title}
      paragraph={paragraph}
      paragraphIndex={paragraphIndex}
      lessonWords={lesson.lessonWords}
      completedCards={lesson.completionSummary.paragraph.completedCards}
      totalCards={lesson.completionSummary.paragraph.totalCards}
      initiallyBookmarked={lesson.bookmarkedParagraphIndexes.includes(paragraphIndex)}
    />
  )
}
