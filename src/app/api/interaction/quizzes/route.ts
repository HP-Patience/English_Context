import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { createQuiz, listQuizzes } from '@/lib/interaction/quiz'

function errorResponse(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number(error.status)
    return NextResponse.json({ error: 'Authentication required' }, { status })
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : '小测验操作失败' }, { status: 400 })
}

export async function GET() {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json({ quizzes: await listQuizzes(user.id) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const body = await request.json() as Record<string, unknown>
    if (typeof body.recipientId !== 'string' || !Array.isArray(body.wordIds) || body.wordIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    }
    return NextResponse.json({ quiz: await createQuiz(user.id, {
      recipientId: body.recipientId,
      wordIds: body.wordIds as string[],
    }) }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
