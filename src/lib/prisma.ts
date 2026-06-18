import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const connectionString = process.env.DATABASE_URL || ''
const url = connectionString.includes('?')
  ? connectionString + '&connection_limit=5&pool_timeout=10'
  : connectionString + '?connection_limit=5&pool_timeout=10'

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url } },
})

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
