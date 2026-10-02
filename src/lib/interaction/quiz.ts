import { prisma } from '@/lib/prisma'
import { assertInteractionPair } from './relationship'

export function validateQuizWordIds(wordIds: string[]) {
  if (!Array.isArray(wordIds) || wordIds.length < 1 || wordIds.length > 10) {
    throw new Error('小测验需要 1 到 10 个单词')
  }
  if (wordIds.some((wordId) => typeof wordId !== 'string' || !wordId.trim()) || new Set(wordIds).size !== wordIds.length) {
    throw new Error('小测验单词格式错误')
  }
  return wordIds
}

export function validateQuizAnswers(answers: Array<{ wordId: string; remembered: boolean }>) {
  if (!Array.isArray(answers) || answers.length < 1) throw new Error('小测验答案不能为空')
  if (answers.some((answer) => typeof answer.wordId !== 'string' || typeof answer.remembered !== 'boolean')) {
    throw new Error('小测验答案格式错误')
  }
  return answers
}

export async function createQuiz(
  senderId: string,
  input: { recipientId: string; wordIds: string[] },
) {
  await assertInteractionPair(senderId, input.recipientId)
  const wordIds = validateQuizWordIds(input.wordIds)
  const words = await prisma.word.findMany({ where: { id: { in: wordIds } }, select: { id: true } })
  if (words.length !== wordIds.length) throw new Error('存在无效单词')
  return prisma.learningQuiz.create({
    data: {
      senderId,
      recipientId: input.recipientId,
      words: { create: wordIds.map((wordId) => ({ wordId })) },
    },
    include: { words: true },
  })
}

export async function listQuizzes(viewerId: string) {
  return prisma.learningQuiz.findMany({
    where: { OR: [{ senderId: viewerId }, { recipientId: viewerId }] },
    include: { words: { include: { word: { select: { id: true, text: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function submitQuiz(
  viewerId: string,
  quizId: string,
  answers: Array<{ wordId: string; remembered: boolean }>,
) {
  const normalized = validateQuizAnswers(answers)
  const quiz = await prisma.learningQuiz.findFirst({
    where: { id: quizId, recipientId: viewerId },
    include: { words: true },
  })
  if (!quiz) throw new Error('小测验不存在')
  const allowed = new Set(quiz.words.map((word) => word.wordId))
  if (normalized.length !== quiz.words.length || normalized.some((answer) => !allowed.has(answer.wordId))) {
    throw new Error('小测验答案不完整')
  }
  await prisma.$transaction([
    ...normalized.map((answer) => prisma.learningQuizWord.updateMany({
      where: { quizId, wordId: answer.wordId },
      data: { answered: answer.remembered, answeredAt: new Date() },
    })),
    prisma.learningQuiz.update({ where: { id: quizId }, data: { completedAt: new Date() } }),
  ])
  return { quizId, answers: normalized }
}
