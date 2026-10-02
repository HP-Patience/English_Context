import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { listMessages, sendMessage } from '@/lib/interaction/message'

function errorResponse(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number(error.status)
    return NextResponse.json({ error: status === 403 ? 'Administrator access required' : 'Authentication required' }, { status })
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : '消息操作失败' }, { status: 400 })
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json({ messages: await listMessages(user.id, request.nextUrl.searchParams.get('cursor') ?? undefined) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const body = await request.json() as Record<string, unknown>
    if (typeof body.recipientId !== 'string' || typeof body.body !== 'string' || typeof body.kind !== 'string') {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    }
    return NextResponse.json({ message: await sendMessage(user.id, {
      recipientId: body.recipientId, body: body.body, kind: body.kind,
    }) }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
