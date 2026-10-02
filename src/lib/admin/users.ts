import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

const USERNAME_MAX_LENGTH = 128
const NAME_MAX_LENGTH = 80
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 1_024

export type ManagedUserInput = {
  username: string
  name: string
  password: string
}

export type AdminUserSummary = {
  id: string
  username: string
  name: string | null
  role: string
  status: string
  statsSharingEnabled: boolean
  createdAt: Date
}

export type SharedStats = {
  learnedWords: number
  reviewSessions: number
  completedDays: number
  storyLessons: number
}

export function normalizeManagedUserInput(input: ManagedUserInput): ManagedUserInput {
  const username = input.username.trim().toLowerCase()
  const name = input.name.trim()
  const password = input.password
  if (!username || username.length > USERNAME_MAX_LENGTH) throw new Error('用户名格式错误')
  if (!name || name.length > NAME_MAX_LENGTH) throw new Error('昵称格式错误')
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error('密码长度必须为 12 到 1024 个字符')
  }
  return { username, name, password }
}

function summary(user: AdminUserSummary): AdminUserSummary {
  return user
}

async function ensureManagedUser(adminId: string, userId: string) {
  if (adminId === userId) throw new Error('不能操作管理员自己的账号')
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!user || user.role !== 'user') throw new Error('普通用户不存在')
  return user
}

export async function listManagedUsers(): Promise<AdminUserSummary[]> {
  const users = await prisma.user.findMany({
    where: { role: 'user' },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      statsSharingEnabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  return users.filter((user): user is AdminUserSummary => Boolean(user.username)).map(summary)
}

export async function createManagedUser(input: ManagedUserInput): Promise<AdminUserSummary> {
  const normalized = normalizeManagedUserInput(input)
  const passwordHash = await hashPassword(normalized.password)
  const user = await prisma.user.create({
    data: {
      username: normalized.username,
      passwordHash,
      name: normalized.name,
      role: 'user',
      status: 'active',
      statsSharingEnabled: false,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      statsSharingEnabled: true,
      createdAt: true,
    },
  })
  if (!user.username) throw new Error('创建账号失败')
  return summary(user as AdminUserSummary)
}

export async function setManagedUserStatus(
  adminId: string,
  userId: string,
  status: 'active' | 'disabled',
): Promise<AdminUserSummary> {
  await ensureManagedUser(adminId, userId)
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      statsSharingEnabled: true,
      createdAt: true,
    },
  })
  if (!user.username) throw new Error('账号数据不完整')
  return summary(user as AdminUserSummary)
}

export async function setStatsSharing(
  adminId: string,
  userId: string,
  enabled: boolean,
): Promise<AdminUserSummary> {
  await ensureManagedUser(adminId, userId)
  const user = await prisma.user.update({
    where: { id: userId },
    data: { statsSharingEnabled: enabled },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      statsSharingEnabled: true,
      createdAt: true,
    },
  })
  if (!user.username) throw new Error('账号数据不完整')
  return summary(user as AdminUserSummary)
}

export async function resetManagedUserPassword(
  adminId: string,
  userId: string,
  password: string,
): Promise<void> {
  await ensureManagedUser(adminId, userId)
  const passwordHash = await hashPassword(normalizeManagedUserInput({
    username: 'temporary',
    name: 'temporary',
    password,
  }).password)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
}

export async function deleteManagedUser(adminId: string, userId: string): Promise<void> {
  await ensureManagedUser(adminId, userId)
  await prisma.$transaction(async (tx) => {
    await tx.generatedSentence.deleteMany({ where: { userWordMeaning: { userWord: { userId } } } })
    await tx.reviewLog.deleteMany({ where: { userWordMeaning: { userWord: { userId } } } })
    await tx.userWordMeaning.deleteMany({ where: { userWord: { userId } } })
    await tx.userWord.deleteMany({ where: { userId } })
    await tx.reviewSession.deleteMany({ where: { userId } })
    await tx.userStoryParagraphCompletion.deleteMany({ where: { userId } })
    await tx.userStoryStepCompletion.deleteMany({ where: { userId } })
    await tx.userStoryLessonCompletion.deleteMany({ where: { userId } })
    await tx.userStoryParagraphBookmark.deleteMany({ where: { userId } })
    await tx.userStoryWordProgress.deleteMany({ where: { userId } })
    await tx.storyReviewAttempt.deleteMany({ where: { userId } })
    await tx.userStoryProgress.deleteMany({ where: { userId } })
    await tx.dailyGoal.deleteMany({ where: { userId } })
    await tx.learningMessage.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } })
    await tx.learningQuizWord.deleteMany({ where: { quiz: { OR: [{ senderId: userId }, { recipientId: userId }] } } })
    await tx.learningQuiz.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } })
    await tx.learningChallengeParticipant.deleteMany({ where: { userId } })
    await tx.learningChallenge.deleteMany({ where: { createdById: userId } })
    await tx.user.delete({ where: { id: userId } })
  })
}

export async function getManagedUserStats(adminId: string, userId: string): Promise<SharedStats> {
  await ensureManagedUser(adminId, userId)
  const [learnedWords, reviewSessions, completedDays, storyLessons] = await Promise.all([
    prisma.userWord.count({ where: { userId, mastery: { gt: 0 } } }),
    prisma.reviewSession.count({ where: { userId } }),
    prisma.dailyGoal.count({ where: { userId, completed: true } }),
    prisma.userStoryLessonCompletion.count({ where: { userId } }),
  ])
  return { learnedWords, reviewSessions, completedDays, storyLessons }
}

