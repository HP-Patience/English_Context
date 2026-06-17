import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

export async function GET() {
  const userId = await getLocalUserId()

  // Overall counts
  const totalWords = await prisma.word.count({ where: { language: 'en' } })
  const learnedWords = await prisma.userWord.count({
    where: { userId, mastery: { gt: 0 } },
  })

  // Mastery distribution
  const userWords = await prisma.userWord.findMany({
    where: { userId },
    select: { mastery: true },
  })
  const dist = { low: 0, medium: 0, high: 0, mastered: 0 }
  for (const uw of userWords) {
    if (uw.mastery >= 75) dist.mastered++
    else if (uw.mastery >= 50) dist.high++
    else if (uw.mastery >= 25) dist.medium++
    else if (uw.mastery > 0) dist.low++
  }

  // Stage-level progress
  const groups = await prisma.wordGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        include: {
          word: {
            include: {
              userWords: { where: { userId } },
            },
          },
        },
      },
    },
  })

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
    for (const gi of g.words) {
      const uw = gi.word.userWords[0]
      entry.total++
      if (uw && uw.mastery > 0) {
        entry.learned++
        entry.totalMastery += uw.mastery
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

  // Weak groups (bottom 5 by avgMastery)
  const weakGroupsRaw = await Promise.all(
    groups.map(async (g) => {
      const total = g.words.length
      let totalMastery = 0
      let learnedCount = 0
      for (const gi of g.words) {
        const uw = gi.word.userWords[0]
        if (uw && uw.mastery > 0) {
          totalMastery += uw.mastery
          learnedCount++
        }
      }
      return {
        id: g.id,
        name: g.name,
        total,
        learned: learnedCount,
        avgMastery: learnedCount > 0 ? Math.round(totalMastery / learnedCount) : 0,
      }
    })
  )
  const weakGroups = weakGroupsRaw
    .filter((g) => g.learned > 0)
    .sort((a, b) => a.avgMastery - b.avgMastery)
    .slice(0, 5)

  // Review forecast: next 7 days
  const forecastDays = 7
  const reviewForecast: Array<{ date: string; dueCount: number }> = []
  for (let i = 0; i < forecastDays; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 86400000)

    const count = await prisma.userWordMeaning.count({
      where: {
        userWord: { userId },
        nextReviewAt: { gte: startOfDay, lt: endOfDay },
        interval: { gt: 0 },
      },
    })
    reviewForecast.push({
      date: startOfDay.toISOString().split('T')[0],
      dueCount: count,
    })
  }

  // Daily activity: last 30 days from ReviewLog
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const logs = await prisma.reviewLog.findMany({
    where: {
      reviewSession: { userId },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const dailyMap = new Map<string, number>()
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    dailyMap.set(key, 0)
  }
  for (const log of logs) {
    const key = log.createdAt.toISOString().split('T')[0]
    if (dailyMap.has(key)) dailyMap.set(key, dailyMap.get(key)! + 1)
  }
  const dailyActivity = Array.from(dailyMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))

  // Daily goal heatmap data
  const goalStart = new Date(today)
  goalStart.setDate(goalStart.getDate() - 29)
  const goalRecords = await prisma.dailyGoal.findMany({
    where: { userId, date: { gte: goalStart } },
    orderBy: { date: 'asc' },
  })
  const goalMap = new Map<string, (typeof goalRecords)[0]>()
  for (const r of goalRecords) {
    goalMap.set(r.date.toISOString().split('T')[0], r)
  }
  const goalHeatmap: Array<{
    date: string
    learned: number
    target: number
    completed: boolean
  }> = []
  const d = new Date(goalStart)
  for (let i = 0; i < 30; i++) {
    const key = d.toISOString().split('T')[0]
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
    overall: { totalWords, learnedWords, avgMastery: learnedWords > 0 ? Math.round(userWords.reduce((s, u) => s + u.mastery, 0) / learnedWords) : 0 },
    masteryDistribution: dist,
    stages,
    weakGroups,
    reviewForecast,
    dailyActivity,
    goalHeatmap,
    streak,
  })
}
