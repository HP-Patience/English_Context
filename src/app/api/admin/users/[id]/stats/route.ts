import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth/current-user'
import { adminErrorResponse } from '@/lib/admin/authorization'
import { getManagedUserStats } from '@/lib/admin/users'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  try {
    const admin = await requireAdmin()
    const { id } = await context.params
    return NextResponse.json({ stats: await getManagedUserStats(admin.id, id) })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
