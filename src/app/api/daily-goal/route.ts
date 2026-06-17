import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

function todayStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const { searchParams } = new URL(req.url)
    const rangeStr = searchParams.get('range')
    const range = rangeStr ? parseInt(rangeStr) : null

    if (range) {
      // Return N days of history for heatmap
      const startDate = new Date(todayStart())
      startDate.setDate(startDate.getDate() - range + 1)
      const records = await prisma.dailyGoal.findMany({
        where: { userId, date: { gte: startDate } },
        orderBy: { date: 'asc' },
      })
      // Fill missing days with empty slots
      const result = []
      const d = new Date(startDate)
      const recordMap = new Map(
        records.map((r) => [fmt(r.date), r])
      )
      for (let i = 0; i < range; i++) {
        const key = fmt(d)
        const record = recordMap.get(key)
        result.push({
          date: key,
          learned: record?.learned ?? 0,
          reviewed: record?.reviewed ?? 0,
          target: record?.target ?? 0,
          completed: record?.completed ?? false,
        })
        d.setDate(d.getDate() + 1)
      }
      return NextResponse.json(result)
    }

    // Return today's goal
    const today = todayStart()
    let goal = await prisma.dailyGoal.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (!goal) {
      // Get user's daily target
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

    return NextResponse.json({
      ...goal,
      date: fmt(goal.date),
      streak,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch daily goal' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const { target } = await req.json()

    if (typeof target !== 'number' || target < 1 || target > 500) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { dailyTarget: target },
    })

    // Update today's goal target too if exists
    const today = todayStart()
    await prisma.dailyGoal.upsert({
      where: { userId_date: { userId, date: today } },
      update: { target },
      create: { userId, date: today, target, learned: 0, reviewed: 0 },
    })

    return NextResponse.json({ target })
  } catch {
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}
