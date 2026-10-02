import { NextResponse } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { getActiveChallenge } from '@/lib/interaction/challenge'
import { getLeaderboards } from '@/lib/interaction/leaderboard'
import { listInteractionPeers } from '@/lib/interaction/relationship'

export async function GET() {
  try {
    const user = await requireCurrentUser()
    const [leaderboards, challenge, peers] = await Promise.all([
      getLeaderboards(user.id),
      getActiveChallenge(user.id),
      listInteractionPeers(user.id),
    ])
    return NextResponse.json({ leaderboards, challenge, peers })
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number(error.status)
      return NextResponse.json({ error: status === 403 ? 'Administrator access required' : 'Authentication required' }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '互动数据读取失败' }, { status: 400 })
  }
}

