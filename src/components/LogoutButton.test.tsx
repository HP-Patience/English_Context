/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearCache: vi.fn(),
  purgeStoryOfflineCache: vi.fn().mockResolvedValue(undefined),
  withStoryOfflineLock: vi.fn(),
}))

vi.mock('@/lib/api-cache', () => ({ clearCache: mocks.clearCache }))
vi.mock('@/lib/story-offline-cache', () => ({
  purgeStoryOfflineCache: mocks.purgeStoryOfflineCache,
  withStoryOfflineLock: mocks.withStoryOfflineLock,
}))

import LogoutButton from './LogoutButton'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withStoryOfflineLock.mockImplementation(async (operation: () => Promise<void>) => operation())
})

describe('LogoutButton', () => {
  it('purges offline story data before sending the logout request', async () => {
    let finishPurge: () => void = () => undefined
    mocks.purgeStoryOfflineCache.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishPurge = resolve
    }))
    let finishLogout: (response: Response) => void = () => undefined
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      finishLogout = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LogoutButton />)

    await userEvent.click(screen.getByRole('button', { name: '退出' }))

    expect(mocks.clearCache).toHaveBeenCalledOnce()
    expect(mocks.purgeStoryOfflineCache).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()

    finishPurge()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    }))
    expect(mocks.withStoryOfflineLock).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '退出中…' })).toBeDisabled()

    finishLogout(new Response('failed', { status: 503 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('退出请求失败')
  })

  it('keeps the session active and reports an error when offline data cannot be purged', async () => {
    mocks.purgeStoryOfflineCache.mockRejectedValueOnce(new DOMException('denied', 'SecurityError'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LogoutButton />)

    await userEvent.click(screen.getByRole('button', { name: '退出' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('离线课程数据未能清除')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '退出' })).toBeEnabled()
  })
})
