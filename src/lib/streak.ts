import { prisma } from './prisma'

export interface GoalRecord {
  date: Date
  completed: boolean
  target: number
  learned: number
  reviewed: number
}

/**
 * Calculate current streak: consecutive days with completed=true,
 * counting backwards from today (or yesterday if today not yet completed).
 * Returns { current, longest }.
 */
export async function calculateStreak(
  userId: string
): Promise<{ current: number; longest: number }> {
  const records = await prisma.dailyGoal.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true, completed: true },
  })

  if (records.length === 0) return { current: 0, longest: 0 }

  // Current streak: start from today, go backwards
  let current = 0
  const todayStr = toDateString(new Date())
  let expectedDate = new Date()

  for (const record of records) {
    const recordStr = toDateString(record.date)
    const expectedStr = toDateString(expectedDate)

    if (recordStr === expectedStr) {
      if (record.completed) {
        current++
      } else if (recordStr === todayStr) {
        // today not completed yet, skip it
        continue
      } else {
        break
      }
    } else if (recordStr === todayStr && record.completed) {
      // today completed
      current++
    } else {
      break
    }
    expectedDate.setDate(expectedDate.getDate() - 1)
  }

  // Longest streak: scan all records
  let longest = 0
  let running = 0
  const sorted = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  for (const record of sorted) {
    if (record.completed) {
      running++
      if (running > longest) longest = running
    } else {
      running = 0
    }
  }

  return { current, longest }
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}
