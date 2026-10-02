import { prisma } from '@/lib/prisma'

export type InteractionUser = {
  id: string
  role: string
  status: string
}

export function isAllowedInteractionPair(left: InteractionUser, right: InteractionUser) {
  if (left.id === right.id) return false
  if (left.status !== 'active' || right.status !== 'active') return false
  return (left.role === 'admin' && right.role === 'user')
    || (left.role === 'user' && right.role === 'admin')
}

export async function assertInteractionPair(actorId: string, otherUserId: string) {
  const users = await prisma.user.findMany({
    where: { id: { in: [actorId, otherUserId] } },
    select: { id: true, role: true, status: true },
  })
  const actor = users.find((user) => user.id === actorId)
  const other = users.find((user) => user.id === otherUserId)
  if (!actor || !other || !isAllowedInteractionPair(actor, other)) {
    throw new Error('互动关系不存在')
  }
  return { actor, other }
}

export async function listInteractionPeers(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  if (!actor || actor.status !== 'active') throw new Error('互动关系不存在')
  return prisma.user.findMany({
    where: actor.role === 'admin' ? { role: 'user', status: 'active' } : { role: 'admin', status: 'active' },
    select: { id: true, name: true, username: true },
    orderBy: { createdAt: 'asc' },
  })
}
