import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth/current-user'
import { adminErrorResponse } from '@/lib/admin/authorization'
import { createManagedUser, listManagedUsers } from '@/lib/admin/users'

export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json({ users: await listManagedUsers() })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json() as Record<string, unknown>
    if (
      typeof body.username !== 'string'
      || typeof body.name !== 'string'
      || typeof body.password !== 'string'
    ) {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    }
    const user = await createManagedUser({
      username: body.username,
      name: body.name,
      password: body.password,
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
