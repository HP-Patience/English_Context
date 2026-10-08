import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocalUserId } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AuthenticationRequiredError } from './errors'
import { requirePageUserId } from './page-user'

vi.mock('@/lib/prisma', () => ({ getLocalUserId: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
afterEach(() => vi.clearAllMocks())

describe('page authentication fallback', () => {
  it('preserves the active account ID', async () => {
    vi.mocked(getLocalUserId).mockResolvedValue('friend-1')
    expect(await requirePageUserId()).toBe('friend-1')
    expect(redirect).not.toHaveBeenCalled()
  })
  it('redirects lost sessions to login instead of a server error page', async () => {
    vi.mocked(getLocalUserId).mockRejectedValue(new AuthenticationRequiredError())
    await expect(requirePageUserId()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })
  it('does not conceal database failures as authentication errors', async () => {
    vi.mocked(getLocalUserId).mockRejectedValue(new Error('database unavailable'))
    await expect(requirePageUserId()).rejects.toThrow('database unavailable')
    expect(redirect).not.toHaveBeenCalled()
  })
})
