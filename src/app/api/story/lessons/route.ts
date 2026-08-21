import { NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import { listStoryLessons } from '@/lib/story-service'
import type { StoryLessonsApiResponse } from '@/lib/story-api-types'

export async function GET() {
  try {
    const userId = await getLocalUserId()
    const lessons = await listStoryLessons({ prisma, userId })
    const response: StoryLessonsApiResponse = {
      lessons,
      currentLessonId: lessons.find((lesson) => lesson.completedStep < 3)?.id ?? null,
      dueCount: lessons.reduce((total, lesson) => total + lesson.dueReviewCount, 0),
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to list story lessons', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
