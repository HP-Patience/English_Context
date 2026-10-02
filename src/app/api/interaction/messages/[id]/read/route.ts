import { NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { markMessageRead } from '@/lib/interaction/message'

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser()
    const { id } = await context.params
    await markMessageRead(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '消息操作失败' }, { status: 400 })
  }
}
