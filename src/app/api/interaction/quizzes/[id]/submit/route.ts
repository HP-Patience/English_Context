import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { submitQuiz } from '@/lib/interaction/quiz'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    const body = await request.json() as Record<string, unknown>
    if (!Array.isArray(body.answers)) return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    return NextResponse.json({ result: await submitQuiz(user.id, id, body.answers as Array<{ wordId: string; remembered: boolean }>) })
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '小测验提交失败' }, { status: 400 })
  }
}
