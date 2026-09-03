import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import { listStoryLessonWords } from '@/lib/story-service'
import {
  classifyStoryApiError,
  normalizeStoryIdentifier,
  parseStoryWordsQuery,
} from '../../../../../../lib/story-api-types'
import type { StoryLessonWordsApiResponse } from '../../../../../../lib/story-api-types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const lessonId = normalizeStoryIdentifier(rawId)
    const userId = await getLocalUserId()
    if (!lessonId) {
      return NextResponse.json({ error: 'Invalid story lesson id' }, { status: 400 })
    }

    const query = parseStoryWordsQuery(request.nextUrl.searchParams)
    if (!query) {
      return NextResponse.json({ error: 'Invalid story words query' }, { status: 400 })
    }

    const result = await listStoryLessonWords({ prisma, userId, lessonId, ...query })
    if (!result) {
      return NextResponse.json({ error: 'Story lesson not found' }, { status: 404 })
    }

    const response: StoryLessonWordsApiResponse = result
    return NextResponse.json(response)
  } catch (error) {
    const status = classifyStoryApiError(error)
    if (status === 500) console.error('Failed to list story lesson words', error)
    return NextResponse.json({ error: status === 404 ? 'Story lesson not found' : 'Internal server error' }, { status })
  }
}
