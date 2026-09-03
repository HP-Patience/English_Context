import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import {
  deleteParagraphCompletion,
  listParagraphCompletions,
  recordParagraphCompletion,
  updateParagraphCompletion,
} from '@/lib/story-completion'
import {
  parseStoryCompletionDeletePayload,
  parseStoryCompletionPayload,
  parseStoryCompletionUpdatePayload,
  parseStoryParagraphIndex,
} from '@/lib/story-completion-api'
import type { StoryCompletionApiResponse, StoryCompletionHistoryApiResponse } from '@/lib/story-completion-api'
import { classifyStoryApiError, normalizeStoryIdentifier } from '@/lib/story-api-types'

type Context = { readonly params: Promise<{ readonly id: string; readonly paragraphIndex: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const values = await params
    const lessonId = normalizeStoryIdentifier(values.id)
    const paragraphIndex = parseStoryParagraphIndex(values.paragraphIndex)
    if (!lessonId || paragraphIndex === null) return NextResponse.json({ error: 'Invalid story paragraph' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionHistoryApiResponse = {
      completions: await listParagraphCompletions({ prisma, userId, lessonId, paragraphIndex }),
    }
    return NextResponse.json(response)
  } catch (error) {
    return completionErrorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const values = await params
    const lessonId = normalizeStoryIdentifier(values.id)
    const paragraphIndex = parseStoryParagraphIndex(values.paragraphIndex)
    if (!lessonId || paragraphIndex === null) return NextResponse.json({ error: 'Invalid story paragraph' }, { status: 400 })
    const payload = parseStoryCompletionPayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionApiResponse = {
      completion: await recordParagraphCompletion({ prisma, userId, lessonId, paragraphIndex, payload }),
    }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    return completionErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const values = await params
    const lessonId = normalizeStoryIdentifier(values.id)
    const paragraphIndex = parseStoryParagraphIndex(values.paragraphIndex)
    if (!lessonId || paragraphIndex === null) return NextResponse.json({ error: 'Invalid story paragraph' }, { status: 400 })
    const payload = parseStoryCompletionUpdatePayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionApiResponse = {
      completion: await updateParagraphCompletion({ prisma, userId, lessonId, paragraphIndex, payload }),
    }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    return completionErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const values = await params
    const lessonId = normalizeStoryIdentifier(values.id)
    const paragraphIndex = parseStoryParagraphIndex(values.paragraphIndex)
    if (!lessonId || paragraphIndex === null) return NextResponse.json({ error: 'Invalid story paragraph' }, { status: 400 })
    const payload = parseStoryCompletionDeletePayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    await deleteParagraphCompletion({
      prisma,
      userId,
      lessonId,
      paragraphIndex,
      completionEventId: payload.id,
    })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    return completionErrorResponse(error)
  }
}

function completionErrorResponse(error: unknown) {
  const status = classifyStoryApiError(error)
  if (status === 500) console.error('Failed to process story paragraph completion', error)
  const message = status === 404 ? 'Story paragraph not found' : status === 409 ? 'Story completion conflict' : 'Internal server error'
  return NextResponse.json({ error: message }, { status })
}
