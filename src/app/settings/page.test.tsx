/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/components/LogoutButton', () => ({ default: () => <button>退出</button> }))
import SettingsPage from './page'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('SettingsPage account entries', () => {
  it.each([true, false])('keeps statistics and logout accessible, showing admin only for permission: %s', async (admin) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: admin })
    vi.stubGlobal('fetch', fetchMock)
    render(<SettingsPage />)
    expect(screen.getByRole('link', { name: /统计/ })).toHaveAttribute('href', '/stats')
    expect(screen.getByRole('button', { name: '退出' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /API 配置/ })).toHaveAttribute('href', '/settings/api')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users', { cache: 'no-store' }))
    if (admin) expect(await screen.findByRole('link', { name: /用户管理/ })).toHaveAttribute('href', '/admin')
    else expect(screen.queryByRole('link', { name: /用户管理/ })).not.toBeInTheDocument()
  })
})
