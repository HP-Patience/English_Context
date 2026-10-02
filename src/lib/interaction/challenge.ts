import { prisma } from '@/lib/prisma'
import { assertInteractionPair } from './relationship'

const CHALLENGE_KINDS = new Set(['active_days', 'learned_words', 'story_completion'])

export type ChallengeInput = {
  title: string
  kind: string
  target: number
  startsAt: string
  endsAt: string
}

export function validateChallengeInput(input: ChallengeInput) {
  const title = input.title.trim()
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (!title || title.length > 120) throw new Error('挑战标题格式错误')
  if (!CHALLENGE_KINDS.has(input.kind)) throw new Error('挑战类型不支持')
  if (!Number.isInteger(input.target) || input.target <= 0) throw new Error('挑战目标必须为正整数')
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error('挑战时间范围格式错误')
  }
  return { title, kind: input.kind, target: input.target, startsAt, endsAt }
}
export type ChallengeProgress = {
  id: string
  title: string
  kind: string
  target: number
  value: number
  startsAt: Date
  endsAt: Date
  participants: Array<{ id: string; name: string | null }>
}

export async function createChallenge(
  adminId: string,
  input: { title: string; kind: string; target: number; startsAt: string; endsAt: string; participantId: string },
) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true, status: true } })
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('管理员权限不足')
  await assertInteractionPair(adminId, input.participantId)
  const data = validateChallengeInput(input)
  const existing = await prisma.learningChallenge.findFirst({ where: { status: 'active' } })
  if (existing) throw new Error('已有进行中的挑战')
  return prisma.learningChallenge.create({
    data: {
      title: data.title,
      kind: data.kind,
      target: data.target,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdById: adminId,
      status: 'active',
      participants: {
        create: [{ userId: adminId }, { userId: input.participantId }],
      },
    },
    include: { participants: { include: { user: { select: { id: true, name: true } } } } },
  })
}

export async function getActiveChallenge(viewerId: string, now = new Date()): Promise<ChallengeProgress | null> {
  const challenge = await prisma.learningChallenge.findFirst({
    where: {
      status: 'active',
      startsAt: { lte: now },
      endsAt: { gt: now },
      participants: { some: { userId: viewerId } },
    },
    include: { participants: { include: { user: { select: { id: true, name: true } } } } },
  })
  if (!challenge) return null
  const userIds = challenge.participants.map((participant) => participant.userId)
  const goals = await prisma.dailyGoal.findMany({
    where: { userId: { in: userIds }, date: { gte: challenge.startsAt, lte: challenge.endsAt } },
    select: { completed: true, learned: true },
  })
  let value = 0
  if (challenge.kind === 'active_days') value = goals.filter((goal) => goal.completed).length
  if (challenge.kind === 'learned_words') value = goals.reduce((sum, goal) => sum + goal.learned, 0)
  if (challenge.kind === 'story_completion') {
    const course = await prisma.storyCourse.findFirst({ where: { status: 'ready', readySlot: 'ready' }, select: { id: true } })
    const totalLessons = course ? await prisma.storyLesson.count({ where: { courseId: course.id, status: 'ready' } }) : 0
    if (course && totalLessons > 0) {
      const completed = await prisma.userStoryLessonCompletion.findMany({
        where: { userId: { in: userIds }, lesson: { courseId: course.id } },
        select: { lessonId: true },
        distinct: ['lessonId'],
      })
      value = Math.round((completed.length / (totalLessons * userIds.length)) * 100)
    }
  }
  return {
    id: challenge.id,
    title: challenge.title,
    kind: challenge.kind,
    target: challenge.target,
    value,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    participants: challenge.participants.map((participant) => participant.user),
  }
}

