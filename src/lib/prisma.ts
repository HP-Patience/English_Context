import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

const LOCAL_USER_ID = process.env.LOCAL_USER_ID || 'local-user'

let _localUserId: string | null = null

export async function getLocalUserId(): Promise<string> {
  if (_localUserId) return _localUserId
  const user = await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, email: 'local@contextvocab.app', name: 'Local User' },
  })
  _localUserId = user.id
  return user.id
}
