import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

export const maxDuration = 30

export async function GET() {
  const userId = await getLocalUserId()

  // All independent queries in parallel
  const [
    totalWords,
    learnedWords,
    userWords,
    groups,
    groupItems,
    userWordMap,
    reviewSessions,
    goalRecords,
  ] = await Promise.all([
    prisma.word.count({ where: { language: 'en' } }),
    prisma.userWord.count({ where: { userId, mastery: { gt: 0 } } }),
    prisma.userWord.findMany({ where: { userId }, select: { mastery: true, wordId: true } }),
    prisma.wordGroup.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true } }),
    prisma.wordGroupItem.findMany({ select: { wordGroupId: true, wordId: true } }),
    prisma.userWord.findMany({ where: { userId }, select: { wordId: true, mastery: true } }),
    prisma.reviewSession.findMany({ where: { userId }, select: { id: true } }),
    prisma.dailyGoal.findMany({ where: { userId, date: { gte: new Date(Date.now() - 29 * 86400000) } }, orderBy: { date: 'asc' } }),
  ])

  // Mastery distribution
  const dist = { low: 0, medium: 0, high: 0, mastered: 0 }
  for (const uw of userWords) {
    if (uw.mastery >= 75) dist.mastered++
    else if (uw.mastery >= 50) dist.high++
    else if (uw.mastery >= 25) dist.medium++
    else if (uw.mastery > 0) dist.low++
  }

  // Avg mastery
  const avgMastery = learnedWords > 0
    ? Math.round(userWords.reduce((s, u) => s + u.mastery, 0) / learnedWords)
    : 0

  // Stage progress - group group items by wordGroupId
  const itemByGroup = new Map<string, string[]>()
  for (const gi of groupItems) {
    if (!itemByGroup.has(gi.wordGroupId)) itemByGroup.set(gi.wordGroupId, [])
    itemByGroup.get(gi.wordGroupId)!.push(gi.wordId)
  }

  const uwByWord = new Map(userWordMap.map((uw) => [uw.wordId, uw.mastery]))

  function getStage(name: string): string {
    if (name.startsWith('高频词')) return '高频词'
    if (name.startsWith('中频词')) return '中频词'
    if (name.startsWith('低频词')) return '低频词'
    if (name.startsWith('偶考词')) return '偶考词'
    if (name.startsWith('基础词')) return '基础词'
    if (name.startsWith('补充词')) return '补充词'
    return '其他'
  }

  const stageMap = new Map<string, { total: number; learned: number; totalMastery: number }>()
  for (const g of groups) {
    const stage = getStage(g.name)
    if (!stageMap.has(stage)) stageMap.set(stage, { total: 0, learned: 0, totalMastery: 0 })
    const entry = stageMap.get(stage)!
    const wordIds = itemByGroup.get(g.id) || []
    for (const wid of wordIds) {
      entry.total++
      const m = uwByWord.get(wid)
      if (m && m > 0) {
        entry.learned++
        entry.totalMastery += m
      }
    }
  }

  const stageOrder = ['高频词', '中频词', '低频词', '偶考词', '基础词', '补充词']
  const stages = stageOrder
    .filter((s) => stageMap.has(s))
    .map((s) => {
      const d = stageMap.get(s)!
      return {
        name: s,
        total: d.total,
        learned: d.learned,
        avgMastery: d.learned > 0 ? Math.round(d.totalMastery / d.learned) : 0,
      }
    })

  // Weak groups - process in JS from already fetched data
  const weakGroupsRaw = groups.map((g) => {
    const wordIds = itemByGroup.get(g.id) || []
    let totalMastery = 0
    let learnedCount = 0
    for (const wid of wordIds) {
      const m = uwByWord.get(wid)
      if (m && m > 0) {
        totalMastery += m
        learnedCount++
      }
    }
    return {
      id: g.id,
      name: g.name,
      total: wordIds.length,
      learned: learnedCount,
      avgMastery: learnedCount > 0 ? Math.round(totalMastery / learnedCount) : 0,
    }
  })
  const weakGroups = weakGroupsRaw
    .filter((g) => g.learned > 0)
    .sort((a, b) => a.avgMastery - b.avgMastery)
    .slice(0, 5)

  // Review forecast - single query
  const today = new Date()
  const forecastStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const forecastEnd = new Date(forecastStart.getTime() + 7 * 86400000)

  const sessionIds = reviewSessions.map((s) => s.id)

  const forecastRaw = await prisma.reviewLog.groupBy({
    by: ['createdAt'],
    where: {
      reviewSessionId: { in: sessionIds },
      createdAt: { gte: forecastStart, lt: forecastEnd },
    },
    _count: { id: true },
  })
  const forecastCounts = new Map<string, number>()
  for (const r of forecastRaw) {
    const key = r.createdAt.toISOString().split('T')[0]
    forecastCounts.set(key, (forecastCounts.get(key) || 0) + r._count.id)
  }

  const reviewForecast: Array<{ date: string; dueCount: number }> = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(forecastStart)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]
    reviewForecast.push({ date: key, dueCount: forecastCounts.get(key) || 0 })
  }

  // Daily activity - use sessionIds from above
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const logDates = await prisma.reviewLog.findMany({
    where: {
      reviewSessionId: { in: sessionIds },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const dailyMap = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dailyMap.set(d.toISOString().split('T')[0], 0)
  }
  for (const log of logDates) {
    const key = log.createdAt.toISOString().split('T')[0]
    if (dailyMap.has(key)) dailyMap.set(key, dailyMap.get(key)! + 1)
  }
  const dailyActivity = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }))

  // Goal heatmap
  function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const goalStart = new Date(today)
  goalStart.setDate(goalStart.getDate() - 29)
  const goalMap = new Map<string, (typeof goalRecords)[0]>()
  for (const r of goalRecords) {
    goalMap.set(fmt(r.date), r)
  }
  const goalHeatmap: Array<{ date: string; learned: number; target: number; completed: boolean }> = []
  const d = new Date(goalStart)
  for (let i = 0; i < 30; i++) {
    const key = fmt(d)
    const record = goalMap.get(key)
    goalHeatmap.push({
      date: key,
      learned: record?.learned ?? 0,
      target: record?.target ?? 0,
      completed: record?.completed ?? false,
    })
    d.setDate(d.getDate() + 1)
  }

  const streak = await calculateStreak(userId)

  return NextResponse.json({
    overall: { totalWords, learnedWords, avgMastery },
    masteryDistribution: dist,
    stages,
    weakGroups,
    reviewForecast,
    dailyActivity,
    goalHeatmap,
    streak,
  })
}
