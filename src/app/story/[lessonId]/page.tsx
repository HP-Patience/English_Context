import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { StoryLessonShell } from '@/components/story/StoryLessonShell'
import { normalizeStoryIdentifier, toPublicStoryLessonDetail } from '@/lib/story-api-types'
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
  const [lesson, lessons] = await Promise.all([
    getStoryLesson({ prisma, userId, lessonId }),
    listStoryLessons({ prisma, userId }),
  ])
  if (!lesson) notFound()

  const orderedLessons = [...lessons].sort((left, right) => left.order - right.order)
  const previousLessonId = orderedLessons.filter((candidate) => candidate.order < lesson.order).at(-1)?.id ?? null
  const nextLessonId = orderedLessons.find((candidate) => candidate.order > lesson.order)?.id ?? null

  const lessonView = toPublicStoryLessonDetail(lesson)

  return (
    <StoryLessonShell
      key={lesson.id}
      lesson={lessonView}
      progress={lesson.progress}
      dueWords={lesson.dueReviewCount}
      previousLessonId={previousLessonId}
      nextLessonId={nextLessonId}
    />
  )
}
