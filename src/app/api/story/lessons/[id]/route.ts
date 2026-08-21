import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import { getStoryLesson } from '@/lib/story-service'
import { normalizeStoryIdentifier } from '../../../../../lib/story-api-types'
import type { StoryLessonApiResponse } from '../../../../../lib/story-api-types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const lessonId = normalizeStoryIdentifier(rawId)
    const userId = await getLocalUserId()
    if (!lessonId) {
      return NextResponse.json({ error: 'Invalid story lesson id' }, { status: 400 })
    }

    const lesson = await getStoryLesson({ prisma, userId, lessonId })
    if (!lesson) {
      return NextResponse.json({ error: 'Story lesson not found' }, { status: 404 })
    }

    const response: StoryLessonApiResponse = { lesson }
    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to load story lesson', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
