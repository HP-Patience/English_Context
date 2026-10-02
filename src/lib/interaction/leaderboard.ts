import { prisma } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

export type LeaderboardEntry = { rank: number; userId: string; displayName: string; value: number }
export type FiveLeaderboards = {
  activeDays: LeaderboardEntry[]
  learnedWords: LeaderboardEntry[]
  reviewCount: LeaderboardEntry[]
  streak: LeaderboardEntry[]
  storyCompletion: LeaderboardEntry[]
}

type RawEntry = { userId: string; displayName: string; value: number }
type LeaderboardUser = { id: string; name: string | null; role: string; status: string; statsSharingEnabled: boolean }

export function startOfWeek(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = date.getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date
}

export function rankEntries(entries: RawEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((left, right) => right.value - left.value || left.displayName.localeCompare(right.displayName))
    .map((entry, index) => ({ rank: index + 1, ...entry }))
}

function visibleUsers(users: LeaderboardUser[], viewerId: string) {
  const viewer = users.find((user) => user.id === viewerId)
  return users.filter((user) => user.status === 'active'
    && (user.id === viewerId || viewer?.role === 'admin' || user.statsSharingEnabled))
}

export async function getLeaderboards(viewerId: string, now = new Date()): Promise<FiveLeaderboards> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['admin', 'user'] } },
    select: { id: true, name: true, role: true, status: true, statsSharingEnabled: true },
  })
  const eligible = visibleUsers(users, viewerId)
  const userIds = eligible.map((user) => user.id)
  const weekStart = startOfWeek(now)
  const dailyGoals = await prisma.dailyGoal.findMany({
    where: { userId: { in: userIds }, date: { gte: weekStart } },
    select: { userId: true, learned: true, reviewed: true, completed: true },
  })

  const byUser = new Map(userIds.map((id) => [id, { activeDays: 0, learnedWords: 0, reviewCount: 0 }]))
  for (const goal of dailyGoals) {
    const totals = byUser.get(goal.userId)
    if (!totals) continue
    if (goal.completed) totals.activeDays += 1
    totals.learnedWords += goal.learned
    totals.reviewCount += goal.reviewed
  }

  const streaks = await Promise.all(userIds.map(async (userId) => [userId, (await calculateStreak(userId)).current] as const))
  const streakByUser = new Map(streaks)
  const storyCourse = await prisma.storyCourse.findFirst({
    where: { status: 'ready', readySlot: 'ready' },
    select: { id: true },
  })
  const totalLessons = storyCourse
    ? await prisma.storyLesson.count({ where: { courseId: storyCourse.id, status: 'ready' } })
    : 0
  const storyCompletion = new Map<string, number>()
  if (storyCourse && totalLessons > 0) {
    await Promise.all(userIds.map(async (userId) => {
      const completed = await prisma.userStoryLessonCompletion.findMany({
        where: { userId, lesson: { courseId: storyCourse.id } },
        select: { lessonId: true },
        distinct: ['lessonId'],
      })
      storyCompletion.set(userId, Math.round((completed.length / totalLessons) * 100))
    }))
  }

  const nameById = new Map(eligible.map((user) => [user.id, user.name || user.id]))
  const entries = (value: (totals: { userId: string; displayName: string; value: number }) => number) => userIds.map((userId) => {
    return { userId, displayName: nameById.get(userId)!, value: value({ userId, displayName: nameById.get(userId)!, value: 0 }) }
  })
  return {
    activeDays: rankEntries(entries(({ userId }) => byUser.get(userId)!.activeDays)),
    learnedWords: rankEntries(entries(({ userId }) => byUser.get(userId)!.learnedWords)),
    reviewCount: rankEntries(entries(({ userId }) => byUser.get(userId)!.reviewCount)),
    streak: rankEntries(entries(({ userId }) => streakByUser.get(userId) ?? 0)),
    storyCompletion: rankEntries(entries(({ userId }) => storyCompletion.get(userId) ?? 0)),
  }
}

