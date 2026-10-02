import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth/current-user'
import { adminErrorResponse } from '@/lib/admin/authorization'
import { resetManagedUserPassword } from '@/lib/admin/users'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    const body = await request.json() as Record<string, unknown>
    if (typeof body.password !== 'string') {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    }
    await resetManagedUserPassword(admin.id, id, body.password)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
