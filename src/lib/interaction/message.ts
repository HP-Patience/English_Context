import { prisma } from '@/lib/prisma'
import { assertInteractionPair } from './relationship'

export const ENCOURAGEMENTS = ['加油！', '做得好！', '继续坚持！'] as const
export type MessageKind = 'text' | 'encouragement'

export function validateMessageInput(input: { body: string; kind: string }) {
  const body = input.body.trim()
  if (!body || body.length > 500) throw new Error('消息内容格式错误')
  if (input.kind !== 'text' && input.kind !== 'encouragement') throw new Error('消息类型不支持')
  if (input.kind === 'encouragement' && !ENCOURAGEMENTS.includes(body as typeof ENCOURAGEMENTS[number])) {
    throw new Error('鼓励内容不支持')
  }
  return { body, kind: input.kind as MessageKind }
}

export type MessageSummary = {
  id: string
  senderId: string
  recipientId: string
  body: string
  kind: string
  readAt: Date | null
  createdAt: Date
}

export async function sendMessage(
  senderId: string,
  input: { recipientId: string; body: string; kind: string },
): Promise<MessageSummary> {
  await assertInteractionPair(senderId, input.recipientId)
  const data = validateMessageInput(input)
  return prisma.learningMessage.create({
    data: { senderId, recipientId: input.recipientId, body: data.body, kind: data.kind },
  })
}

export async function listMessages(senderId: string, cursor?: string): Promise<MessageSummary[]> {
  const messages = await prisma.learningMessage.findMany({
    where: { OR: [{ senderId }, { recipientId: senderId }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })
  return messages
}

export async function markMessageRead(viewerId: string, messageId: string) {
  const result = await prisma.learningMessage.updateMany({
    where: { id: messageId, recipientId: viewerId },
    data: { readAt: new Date() },
  })
  if (result.count !== 1) throw new Error('消息不存在')
}
