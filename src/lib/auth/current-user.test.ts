import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { createSessionToken } from './session'
import { getCurrentUser, requireAdmin, requireCurrentUser } from './current-user'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

const secret = 'current-user-secret-that-is-at-least-thirty-two-characters'
const findUnique = vi.mocked(prisma.user.findUnique)
const cookieStore = vi.mocked(cookies)

beforeEach(() => {
  vi.stubEnv('APP_AUTH_SECRET', secret)
  vi.stubEnv('APP_AUTH_SECURE_COOKIE', 'false')
  findUnique.mockReset()
  cookieStore.mockReset()
})

describe('current user', () => {
  it('resolves an active database user from the session cookie', async () => {
    const token = await createSessionToken('user-1', secret)
    cookieStore.mockResolvedValue({ get: () => ({ value: token }) } as never)
    findUnique.mockResolvedValue({
      id: 'user-1', username: 'owner', name: 'Owner', role: 'admin', status: 'active', statsSharingEnabled: true,
    } as never)

    await expect(getCurrentUser()).resolves.toEqual({
      id: 'user-1', username: 'owner', name: 'Owner', role: 'admin', status: 'active', statsSharingEnabled: true,
    })
  })

  it('rejects disabled and missing users', async () => {
    const token = await createSessionToken('user-1', secret)
    cookieStore.mockResolvedValue({ get: () => ({ value: token }) } as never)
    findUnique.mockResolvedValue({
      id: 'user-1', username: 'friend', name: 'Friend', role: 'user', status: 'disabled', statsSharingEnabled: false,
    } as never)

    await expect(getCurrentUser()).resolves.toBeNull()
    await expect(requireCurrentUser()).rejects.toMatchObject({ status: 401 })
  })

  it('requires the administrator role', async () => {
    const token = await createSessionToken('user-1', secret)
    cookieStore.mockResolvedValue({ get: () => ({ value: token }) } as never)
    findUnique.mockResolvedValue({
      id: 'user-1', username: 'friend', name: 'Friend', role: 'user', status: 'active', statsSharingEnabled: false,
    } as never)

    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 })
  })
})
