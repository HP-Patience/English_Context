import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'
import {
  deleteStepCompletion,
  listStepCompletions,
  recordStepCompletion,
  updateStepCompletion,
} from '@/lib/story-completion'
import {
  parseStoryCompletionDeletePayload,
  parseStoryCompletionPayload,
  parseStoryCompletionUpdatePayload,
  parseStoryFirstPassStep,
} from '@/lib/story-completion-api'
import type { StoryCompletionApiResponse, StoryCompletionHistoryApiResponse } from '@/lib/story-completion-api'
import { classifyStoryApiError, normalizeStoryIdentifier } from '@/lib/story-api-types'

type Context = { readonly params: Promise<{ readonly id: string; readonly step: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const values = await params
    const lessonId = normalizeStoryIdentifier(values.id)
    const step = parseStoryFirstPassStep(values.step)
    if (!lessonId || !step) return NextResponse.json({ error: 'Invalid story step' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionHistoryApiResponse = {
      completions: await listStepCompletions({ prisma, userId, lessonId, step }),
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
    const step = parseStoryFirstPassStep(values.step)
    if (!lessonId || !step) return NextResponse.json({ error: 'Invalid story step' }, { status: 400 })
    const payload = parseStoryCompletionPayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionApiResponse = {
      completion: await recordStepCompletion({ prisma, userId, lessonId, step, payload }),
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
    const step = parseStoryFirstPassStep(values.step)
    if (!lessonId || !step) return NextResponse.json({ error: 'Invalid story step' }, { status: 400 })
    const payload = parseStoryCompletionUpdatePayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    const response: StoryCompletionApiResponse = {
      completion: await updateStepCompletion({ prisma, userId, lessonId, step, payload }),
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
    const step = parseStoryFirstPassStep(values.step)
    if (!lessonId || !step) return NextResponse.json({ error: 'Invalid story step' }, { status: 400 })
    const payload = parseStoryCompletionDeletePayload(await request.json())
    if (!payload) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    const userId = await getLocalUserId()
    await deleteStepCompletion({ prisma, userId, lessonId, step, completionEventId: payload.id })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid story completion payload' }, { status: 400 })
    return completionErrorResponse(error)
  }
}

function completionErrorResponse(error: unknown) {
  const status = classifyStoryApiError(error)
  if (status === 500) console.error('Failed to process story step completion', error)
  const message = status === 404 ? 'Story lesson not found' : status === 409 ? 'Story completion conflict' : 'Internal server error'
  return NextResponse.json({ error: message }, { status })
}
