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
  const oneYearAgo = new Date()
  oneYearAgo.setDate(oneYearAgo.getDate() - 366)

  const records = await prisma.dailyGoal.findMany({
    where: { userId, date: { gte: oneYearAgo } },
    orderBy: { date: 'desc' },
    select: { date: true, completed: true },
  })

  if (records.length === 0) return { current: 0, longest: 0 }

  // Current streak: start from today; if today isn't completed, start from yesterday.
  // Walk backwards counting consecutive completed days.
  let current = 0

  // Determine the first day to check
  const firstRecord = records[0]
  const firstRecordStr = toLocalDateStr(firstRecord.date)
  const todayStr = toLocalDateStr(new Date())

  if (firstRecordStr === todayStr && firstRecord.completed) {
    // Today completed — start streak from today
    let expectedDate = new Date()
    for (const record of records) {
      const recordStr = toLocalDateStr(record.date)
      const expectedStr = toLocalDateStr(expectedDate)

      if (recordStr === expectedStr) {
        if (record.completed) {
          current++
          expectedDate.setDate(expectedDate.getDate() - 1)
        } else {
          break
        }
      } else if (recordStr < expectedStr) {
        // Record is older than expected — gap in sequence, streak broken
        break
      }
      // recordStr > expectedStr: record is newer, skip it
    }
  } else {
    // Today not completed or no record for today — start streak from yesterday
    let expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() - 1)

    for (const record of records) {
      const recordStr = toLocalDateStr(record.date)
      const expectedStr = toLocalDateStr(expectedDate)

      if (recordStr === expectedStr) {
        if (record.completed) {
          current++
          expectedDate.setDate(expectedDate.getDate() - 1)
        } else {
          break
        }
      } else if (recordStr < expectedStr) {
        // Record is older than expected — gap, streak broken
        break
      }
      // recordStr > expectedStr: record is newer, skip it
    }
  }

  // Longest streak: scan sorted records, check calendar-day adjacency
  let longest = 0
  let running = 0
  let prevDateStr: string | null = null

  const sorted = [...records].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )

  for (const record of sorted) {
    const recordStr = toLocalDateStr(record.date)

    if (record.completed) {
      if (prevDateStr === null) {
        running = 1
      } else {
        // Check if this record is the next calendar day after the previous
        const [y, m, d] = prevDateStr.split('-').map(Number)
        const expectedNext = new Date(y, m - 1, d + 1)
        const expectedNextStr = toLocalDateStr(expectedNext)

        if (recordStr === expectedNextStr) {
          running++
        } else {
          running = 1
        }
      }
      if (running > longest) longest = running
    } else {
      running = 0
    }
    prevDateStr = recordStr
  }

  return { current, longest }
}

/** Convert a Date to "YYYY-MM-DD" in local timezone. */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
