import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  try {
    const userId = await getLocalUserId()

    // Top 20 most-failed words
    const failedRaw = await prisma.reviewLog.groupBy({
      by: ['userWordMeaningId'],
      where: {
        result: 'fail',
        reviewSession: { userId },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    const failedIds = failedRaw.map((f) => f.userWordMeaningId)
    const failedDetails = await prisma.userWordMeaning.findMany({
      where: { id: { in: failedIds } },
      include: {
        meaning: { include: { word: true } },
      },
    })
    const failedMap = new Map(failedDetails.map((d) => [d.id, d]))
    const lastFailedRaw = await prisma.reviewLog.groupBy({
      by: ['userWordMeaningId'],
      where: { userWordMeaningId: { in: failedIds }, result: 'fail' },
      _max: { createdAt: true },
    })
    const lastFailedMap = new Map(
      lastFailedRaw.map((f) => [f.userWordMeaningId, f._max.createdAt])
    )

    const topFailed = failedRaw
      .map((f) => {
        const d = failedMap.get(f.userWordMeaningId)
        if (!d) return null
        return {
          userWordMeaningId: f.userWordMeaningId,
          word: d.meaning.word.text,
          partOfSpeech: d.meaning.partOfSpeech,
          definitionCn: d.meaning.definitionCn,
          failCount: f._count.id,
          lastFailedAt: lastFailedMap.get(f.userWordMeaningId),
        }
      })
      .filter(Boolean)

    // Top 20 lowest mastery
    const lowMastery = await prisma.userWordMeaning.findMany({
      where: {
        userWord: { userId },
        interval: { gt: 0 },
      },
      orderBy: [{ mastery: 'asc' }, { easeFactor: 'asc' }],
      take: 20,
      include: { meaning: { include: { word: true } } },
    })
    const lowestMastery = lowMastery.map((m) => ({
      userWordMeaningId: m.id,
      word: m.meaning.word.text,
      partOfSpeech: m.meaning.partOfSpeech,
      definitionCn: m.meaning.definitionCn,
      mastery: m.mastery,
      easeFactor: m.easeFactor,
      nextReviewAt: m.nextReviewAt,
    }))

    // Trend
    const agg = await prisma.userWordMeaning.aggregate({
      where: { userWord: { userId }, interval: { gt: 0 } },
      _avg: { mastery: true, interval: true },
    })
    const avgMastery = Math.round(agg._avg.mastery ?? 0)
    const avgInterval = Math.round((agg._avg.interval ?? 0) * 10) / 10

    // Last 7 days pass rate
    const recentPassRate = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(start.getTime() + 86400000)
      const total = await prisma.reviewLog.count({
        where: {
          reviewSession: { userId },
          createdAt: { gte: start, lt: end },
        },
      })
      const passed = await prisma.reviewLog.count({
        where: {
          reviewSession: { userId },
          createdAt: { gte: start, lt: end },
          result: 'pass',
        },
      })
      recentPassRate.push({
        date: start.toISOString().split('T')[0],
        rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      })
    }

    const needsAttention = await prisma.userWordMeaning.count({
      where: { userWord: { userId }, mastery: { lt: 30 }, interval: { gt: 0 } },
    })

    return NextResponse.json({
      topFailed,
      lowestMastery,
      trend: { avgMastery, avgInterval, recentPassRate, needsAttention },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
  }
}
