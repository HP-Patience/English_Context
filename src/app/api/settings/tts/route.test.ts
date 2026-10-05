/** @vitest-environment node */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getLocalUserId: vi.fn(), prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/prisma', () => mocks)
import { GET, PUT } from './route'
beforeEach(() => { vi.resetAllMocks(); mocks.getLocalUserId.mockResolvedValue('user-2'); mocks.prisma.user.findUnique.mockResolvedValue({ ttsConfig: JSON.stringify({ provider: 'browser', voice: 'alloy', apiKey: 'private-key' }) }); mocks.prisma.user.update.mockResolvedValue({}) })
const request = (body: unknown) => new NextRequest('http://server:3456/api/settings/tts', { method: 'PUT', body: JSON.stringify(body) })
describe('account-scoped browser voice settings', () => {
  it('saves browser voice without overwriting API voice or keys', async () => {
    expect((await PUT(request({ browserVoice: 'David' }))).status).toBe(200)
    const args = mocks.prisma.user.update.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'user-2' })
    expect(JSON.parse(args.data.ttsConfig)).toEqual({ provider: 'browser', voice: 'alloy', apiKey: 'private-key', browserVoice: 'David' })
  })
  it('returns browser voice with no secret values', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ttsConfig: JSON.stringify({ browserVoice: 'David', apiKey: 'private-key' }) })
    const data = await (await GET()).json()
    expect(data.browserVoice).toBe('David')
    expect(data.hasKey).toBe(true)
    expect(data.apiKey).toBeUndefined()
  })
  it('clears the saved choice and rejects invalid voice data', async () => {
    expect((await PUT(request({ browserVoice: '' }))).status).toBe(200)
    expect(JSON.parse(mocks.prisma.user.update.mock.calls[0][0].data.ttsConfig).browserVoice).toBeUndefined()
    expect((await PUT(request({ browserVoice: 42 }))).status).toBe(400)
    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1)
  })
})
