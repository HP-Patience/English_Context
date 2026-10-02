import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { createChallenge, getActiveChallenge } from '@/lib/interaction/challenge'

export async function GET() {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json({ challenge: await getActiveChallenge(user.id) })
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: '挑战读取失败' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireCurrentUser()
    if (admin.role !== 'admin') return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
    const body = await request.json() as Record<string, unknown>
    if (
      typeof body.title !== 'string' || typeof body.kind !== 'string'
      || typeof body.target !== 'number' || typeof body.startsAt !== 'string'
      || typeof body.endsAt !== 'string' || typeof body.participantId !== 'string'
    ) return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    const challenge = await createChallenge(admin.id, {
      title: body.title, kind: body.kind, target: body.target,
      startsAt: body.startsAt, endsAt: body.endsAt, participantId: body.participantId,
    })
    return NextResponse.json({ challenge }, { status: 201 })
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: status === 403 ? 'Administrator access required' : 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '挑战创建失败' }, { status: 400 })
  }
}
