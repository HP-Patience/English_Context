import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth/current-user'
import { adminErrorResponse } from '@/lib/admin/authorization'
import { deleteManagedUser, setManagedUserStatus, setStatsSharing } from '@/lib/admin/users'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    const body = await request.json() as Record<string, unknown>
    let user
    if (body.status === 'active' || body.status === 'disabled') {
      user = await setManagedUserStatus(admin.id, id, body.status)
    } else if (typeof body.statsSharingEnabled === 'boolean') {
      user = await setStatsSharing(admin.id, id, body.statsSharingEnabled)
    } else {
      return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
    }
    return NextResponse.json({ user })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    await deleteManagedUser(admin.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
