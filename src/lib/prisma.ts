import { cookies } from 'next/headers'
import { PrismaClient } from '@prisma/client'

import { AuthenticationRequiredError } from './auth/errors'
import { getAuthConfig } from './auth/config'
import { AUTH_SESSION_COOKIE, verifySessionToken } from './auth/session'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function getSessionUserId(): Promise<string | null> {
  const authConfig = getAuthConfig()
  if (!authConfig) return null
  const cookieStore = await cookies()
  return verifySessionToken(
    cookieStore.get(AUTH_SESSION_COOKIE)?.value,
    authConfig.secret,
  )
}

/**
 * Compatibility name for existing learning paths.
 * It now resolves the active session user and never falls back to a fixed user.
 */
export async function getLocalUserId(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) throw new AuthenticationRequiredError()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  })
  if (!user || user.status !== 'active') throw new AuthenticationRequiredError()
  return userId
}
