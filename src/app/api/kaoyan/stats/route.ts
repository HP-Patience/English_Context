import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

// Simple in-memory cache — stats change only when user learns/reviews
const cache = new Map<string, { data: unknown; expiresAt: number }>()
function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  return entry && Date.now() < entry.expiresAt ? (entry.data as T) : null
}
function setCache(key: string, data: unknown, ttlMs = 300_000) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

async function fetchStats(userId: string) {
  // 1 round trip: total + learned + due counts
  const [counts] = await prisma.$queryRaw<
    { totalWords: number; learnedCount: number; dueCount: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM "UserWord" WHERE "userId" = ${userId}) AS "totalWords",
      (SELECT COUNT(*)::int FROM "UserWord" WHERE "userId" = ${userId} AND mastery > 0) AS "learnedCount",
      (SELECT COUNT(*)::int FROM "UserWordMeaning" uwm
       JOIN "UserWord" uw ON uw.id = uwm."userWordId"
       WHERE uw."userId" = ${userId}
         AND uwm."nextReviewAt" <= NOW()
         AND uwm.interval > 0) AS "dueCount"
  `

  // 1 round trip: group-level progress with names, sorted
  const groups = await prisma.$queryRaw<
    { id: string; name: string; total: number; learned: number }[]
  >`
    SELECT
      wg.id,
      wg.name,
      COUNT(*)::int AS total,
      COUNT(CASE WHEN uw.mastery > 0 THEN 1 END)::int AS learned
    FROM "WordGroupItem" wgi
    JOIN "Word" w ON w.id = wgi."wordId"
    JOIN "WordGroup" wg ON wg.id = wgi."wordGroupId"
    LEFT JOIN "UserWord" uw ON uw."wordId" = w.id AND uw."userId" = ${userId}
    GROUP BY wg.id, wg.name, wg."sortOrder"
    ORDER BY wg."sortOrder" ASC
  `

  return { ...counts, groups }
}

function todayStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

async function fetchDailyGoal(userId: string) {
  const today = todayStart()

  let goal = await prisma.dailyGoal.findUnique({
    where: { userId_date: { userId, date: today } },
  })

  if (!goal) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyTarget: true },
    })
    goal = await prisma.dailyGoal.create({
      data: {
        userId,
        date: today,
        target: user?.dailyTarget ?? 30,
        learned: 0,
        reviewed: 0,
        completed: false,
      },
    })
  }

  const streak = await calculateStreak(userId)

  return {
    learned: goal.learned,
    reviewed: goal.reviewed,
    target: goal.target,
    completed: goal.completed,
    streak,
  }
}

export async function GET() {
  const userId = await getLocalUserId()
  const cacheKey = `homepage:${userId}`

  const cached = getCached<any>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  }

  const [stats, dailyGoal] = await Promise.all([
    fetchStats(userId),
    fetchDailyGoal(userId).catch(() => null),
  ])

  const result = { ...stats, dailyGoal }
  setCache(cacheKey, result)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}
