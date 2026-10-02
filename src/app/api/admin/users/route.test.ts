import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { requireAdmin } from '@/lib/auth/current-user'
import { createManagedUser, listManagedUsers } from '@/lib/admin/users'
import { GET, POST } from './route'

vi.mock('@/lib/auth/current-user', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/admin/users', () => ({
  createManagedUser: vi.fn(),
  listManagedUsers: vi.fn(),
}))

const admin = {
  id: 'admin-1', username: 'owner', name: 'Owner', role: 'admin', status: 'active', statsSharingEnabled: true,
} as const
const requireAdminMock = vi.mocked(requireAdmin)
const listMock = vi.mocked(listManagedUsers)
const createMock = vi.mocked(createManagedUser)

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(admin)
  listMock.mockResolvedValue([])
  createMock.mockResolvedValue({
    id: 'friend-1', username: 'friend', name: 'Friend', role: 'user', status: 'active', statsSharingEnabled: false, createdAt: new Date('2026-10-02'),
  })
})

describe('admin users route', () => {
  it('lists managed users for an administrator', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ users: [] })
  })

  it('creates a managed user without accepting an admin id from the body', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'friend', name: 'Friend', password: 'correct-password-123' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(response.status).toBe(201)
    expect(createMock).toHaveBeenCalledWith({
      username: 'friend', name: 'Friend', password: 'correct-password-123',
    })
  })
})


