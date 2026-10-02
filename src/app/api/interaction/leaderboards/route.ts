import { NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { getLeaderboards } from '@/lib/interaction/leaderboard'

export async function GET() {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json(await getLeaderboards(user.id))
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: status === 403 ? 'Administrator access required' : 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: '排行榜读取失败' }, { status: 400 })
  }
}
