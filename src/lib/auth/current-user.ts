import { cookies } from 'next/headers'

import { AuthenticationRequiredError } from './errors'
import { prisma } from '@/lib/prisma'
import { getAuthConfig } from './config'
import { AUTH_SESSION_COOKIE, verifySessionToken } from './session'

export type CurrentUser = {
  id: string
  username: string
  name: string | null
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  statsSharingEnabled: boolean
}

export { AuthenticationRequiredError } from './errors'

export class AdministratorRequiredError extends Error {
  readonly status = 403

  constructor() {
    super('Administrator access required')
    this.name = 'AdministratorRequiredError'
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const authConfig = getAuthConfig()
  if (!authConfig) return null

  const cookieStore = await cookies()
  const userId = await verifySessionToken(
    cookieStore.get(AUTH_SESSION_COOKIE)?.value,
    authConfig.secret,
  )
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      statsSharingEnabled: true,
    },
  })

  if (!user || !user.username || user.status !== 'active') return null
  if (user.role !== 'admin' && user.role !== 'user') return null

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    statsSharingEnabled: user.statsSharingEnabled,
  }
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthenticationRequiredError()
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireCurrentUser()
  if (user.role !== 'admin') throw new AdministratorRequiredError()
  return user
}
