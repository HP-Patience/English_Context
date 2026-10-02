'use client'

import { useCallback, useEffect, useState } from 'react'
import LeaderboardPanel, { LeaderboardData } from './LeaderboardPanel'
import ChallengePanel from './ChallengePanel'
import MessagePanel from './MessagePanel'
import QuizPanel from './QuizPanel'

type Peer = { id: string; name: string | null; username: string }
type Challenge = { id: string; title: string; kind: string; target: number; value: number; endsAt: string }
type Message = { id: string; senderId: string; body: string; kind: string; readAt: string | null; createdAt: string }
type Quiz = { id: string; senderId: string; recipientId: string; completedAt: string | null; words: Array<{ wordId: string; word?: { text: string } }> }

export default function InteractionDashboard() {
  const [leaderboards, setLeaderboards] = useState<LeaderboardData>()
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [admin, setAdmin] = useState(false)
  const [recipientId, setRecipientId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [overviewResponse, messageResponse, quizResponse, adminResponse] = await Promise.all([
        fetch('/api/interaction/overview', { cache: 'no-store' }),
        fetch('/api/interaction/messages', { cache: 'no-store' }),
        fetch('/api/interaction/quizzes', { cache: 'no-store' }),
        fetch('/api/admin/users', { cache: 'no-store' }),
      ])
      if (!overviewResponse.ok) throw new Error('互动数据读取失败')
      const overview = await overviewResponse.json() as { leaderboards: LeaderboardData; challenge: Challenge | null; peers: Peer[] }
      setLeaderboards(overview.leaderboards)
      setChallenge(overview.challenge)
      setPeers(overview.peers ?? [])
      setRecipientId((current) => current || overview.peers?.[0]?.id || '')
      if (messageResponse.ok) setMessages((await messageResponse.json()).messages ?? [])
      if (quizResponse.ok) setQuizzes((await quizResponse.json()).quizzes ?? [])
      setAdmin(adminResponse.ok)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '互动数据读取失败')
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">学习互动</h1><p className="mt-1 text-sm text-stone-500 dark:text-stone-400">和学习伙伴一起保持节奏。</p></div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {peers.length > 1 ? <label className="block text-sm">互动对象<select aria-label="互动对象" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="ml-2 rounded-lg border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-950">{peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.name || peer.username}</option>)}</select></label> : null}
    <LeaderboardPanel data={leaderboards} />
    <ChallengePanel challenge={challenge} admin={admin} onRefresh={refresh} />
    {recipientId ? <MessagePanel messages={messages} recipientId={recipientId} onRefresh={refresh} /> : <p className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-500">暂无可互动的学习伙伴。</p>}
    {recipientId ? <QuizPanel quizzes={quizzes} recipientId={recipientId} onRefresh={refresh} /> : null}
  </div>
}


