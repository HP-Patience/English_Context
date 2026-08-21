import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { StoryLessonShell } from '@/components/story/StoryLessonShell'
import { normalizeStoryIdentifier } from '@/lib/story-api-types'
import { getLocalUserId, prisma } from '@/lib/prisma'
import { getStoryLesson, listStoryLessons } from '@/lib/story-service'

export const metadata: Metadata = {
  title: '故事学习 — ContextVocab',
  description: '在连续故事中完成语境识词、遮义回想与词册复习。',
}

type StoryLessonPageProps = {
  params: Promise<{ lessonId: string }>
}

export default async function StoryLessonPage({ params }: StoryLessonPageProps) {
  await connection()
  const { lessonId: rawLessonId } = await params
  const lessonId = normalizeStoryIdentifier(rawLessonId)
  if (!lessonId) notFound()

  const userId = await getLocalUserId()
  const lesson = await getStoryLesson({ prisma, userId, lessonId })
  if (!lesson) notFound()

  const lessons = await listStoryLessons({ prisma, userId })
  const nextLessonId = [...lessons]
    .sort((left, right) => left.order - right.order)
    .find((candidate) => candidate.order > lesson.order)?.id ?? null

  const lessonView = {
    id: lesson.id,
    order: lesson.order,
    title: lesson.title,
    sourceChapterStart: lesson.sourceChapterStart,
    sourceChapterEnd: lesson.sourceChapterEnd,
    content: { paragraphs: lesson.content.paragraphs },
    lessonWords: lesson.lessonWords,
  }

  return (
    <StoryLessonShell
      lesson={lessonView}
      progress={lesson.progress}
      dueWords={lesson.dueReviewCount}
      nextLessonId={nextLessonId}
    />
  )
}
