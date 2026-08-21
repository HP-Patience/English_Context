import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import { saveFirstPassStep } from '@/lib/story-service'
import {
  classifyStoryApiError,
  normalizeStoryIdentifier,
  parseStoryProgressPayload,
} from '../../../../../../lib/story-api-types'
import type { StoryProgressApiResponse } from '../../../../../../lib/story-api-types'

export async function POST(
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

    let rawPayload: unknown
    try {
      rawPayload = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid story progress payload' }, { status: 400 })
    }
    const payload = parseStoryProgressPayload(rawPayload)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid story progress payload' }, { status: 400 })
    }

    const progress = await saveFirstPassStep({ prisma, userId, lessonId, step: payload.step })
    const response: StoryProgressApiResponse = { progress }
    return NextResponse.json(response)
  } catch (error) {
    const status = classifyStoryApiError(error)
    if (status === 500) console.error('Failed to save story progress', error)
    return NextResponse.json(
      { error: status === 404 ? 'Story lesson not found' : status === 409 ? 'Story progress conflict' : 'Internal server error' },
      { status },
    )
  }
}
