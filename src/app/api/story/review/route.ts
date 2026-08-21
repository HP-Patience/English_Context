import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import { getDueStoryWords, submitStoryReview } from '@/lib/story-review'
import {
  classifyStoryApiError,
  groupDueStoryWords,
  normalizeStoryIdentifier,
  parseStoryReviewPayload,
  serializeStoryReviewResult,
} from '../../../../lib/story-api-types'
import type { StoryReviewApiResponse } from '../../../../lib/story-api-types'

export async function GET(request: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const rawLessonId = request.nextUrl.searchParams.get('lessonId')
    const lessonId = rawLessonId === null ? undefined : normalizeStoryIdentifier(rawLessonId)
    if (rawLessonId !== null && !lessonId) {
      return NextResponse.json({ error: 'Invalid story lesson id' }, { status: 400 })
    }

    const words = await getDueStoryWords({ prisma, userId, ...(lessonId ? { lessonId } : {}) })
    return NextResponse.json(groupDueStoryWords(words))
  } catch (error) {
    console.error('Failed to load story review queue', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getLocalUserId()
    let rawPayload: unknown
    try {
      rawPayload = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid story review payload' }, { status: 400 })
    }
    const payload = parseStoryReviewPayload(rawPayload)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid story review payload' }, { status: 400 })
    }

    const result = await submitStoryReview({ prisma, userId, ...payload })
    const response: StoryReviewApiResponse = { review: serializeStoryReviewResult(result) }
    return NextResponse.json(response)
  } catch (error) {
    const status = classifyStoryApiError(error)
    if (status === 500) console.error('Failed to submit story review', error)
    return NextResponse.json(
      { error: status === 404 ? 'Story lesson word not found' : status === 409 ? 'Story review conflict' : 'Internal server error' },
      { status },
    )
  }
}
