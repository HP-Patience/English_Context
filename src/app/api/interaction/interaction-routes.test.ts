import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { requireCurrentUser } from '@/lib/auth/current-user'
import { getLeaderboards } from '@/lib/interaction/leaderboard'
import { sendMessage } from '@/lib/interaction/message'
import { GET as getLeaderboardsRoute } from './leaderboards/route'
import { POST as sendMessageRoute } from './messages/route'

vi.mock('@/lib/auth/current-user', () => ({ requireCurrentUser: vi.fn() }))
vi.mock('@/lib/interaction/leaderboard', () => ({ getLeaderboards: vi.fn() }))
vi.mock('@/lib/interaction/message', () => ({ listMessages: vi.fn(), sendMessage: vi.fn() }))

const user = {
  id: 'admin-1', username: 'owner', name: 'Owner', role: 'admin' as const, status: 'active' as const, statsSharingEnabled: true,
}
const requireMock = vi.mocked(requireCurrentUser)
const leaderboardsMock = vi.mocked(getLeaderboards)
const sendMock = vi.mocked(sendMessage)

beforeEach(() => {
  vi.clearAllMocks()
  requireMock.mockResolvedValue(user)
  leaderboardsMock.mockResolvedValue({ activeDays: [], learnedWords: [], reviewCount: [], streak: [], storyCompletion: [] })
  sendMock.mockResolvedValue({
    id: 'message-1', senderId: 'admin-1', recipientId: 'friend-1', body: '加油！', kind: 'encouragement', readAt: null, createdAt: new Date('2026-10-02'),
  })
})

describe('interaction routes', () => {
  it('returns five leaderboard views for the current user', async () => {
    const response = await getLeaderboardsRoute()
    expect(response.status).toBe(200)
    expect(leaderboardsMock).toHaveBeenCalledWith('admin-1')
  })

  it('uses the session user as sender and accepts no sender id from the body', async () => {
    const response = await sendMessageRoute(new NextRequest('http://localhost/api/interaction/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: 'friend-1', recipientId: 'friend-1', body: '加油！', kind: 'encouragement' }),
    }))
    expect(response.status).toBe(201)
    expect(sendMock).toHaveBeenCalledWith('admin-1', {
      recipientId: 'friend-1', body: '加油！', kind: 'encouragement',
    })
  })
})
