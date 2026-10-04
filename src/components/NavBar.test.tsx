/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pathname: '/story/lesson-1' }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('./ThemeToggle', () => ({ default: () => <button aria-label="主题切换" /> }))
import NavBar from './NavBar'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.pathname = '/story/lesson-1' })

describe('NavBar', () => {
  it('keeps five primary links, two icon links, and no account actions or permission request', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<NavBar />)
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['故事', '单词', '复习', '收藏', '互动'])
    expect(within(nav).getByRole('link', { name: '单词' })).toHaveAttribute('href', '/learn')
    expect(within(nav).getByRole('link', { name: '故事' })).toHaveAttribute('aria-current', 'page')
    for (const name of ['搜索', '设置']) {
      const link = screen.getByRole('link', { name })
      expect(link.textContent).toBe('')
      expect(link.querySelector('svg')).toHaveAttribute('width', '20')
    }
    expect(screen.queryByRole('link', { name: '统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '退出' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '主题切换' })).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('reuses the mobile menu and closes it after selecting a primary destination', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const mobile = screen.getByRole('navigation', { name: '移动导航' })
    const bookmarks = within(mobile).getByRole('link', { name: '收藏' })
    expect(bookmarks).toHaveAttribute('href', '/bookmarks')
    fireEvent.click(bookmarks)
    expect(screen.queryByRole('navigation', { name: '移动导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开菜单' })).toHaveAttribute('aria-expanded', 'false')
  })
  it('keeps only the theme control on the login page', () => {
    mocks.pathname = '/login'
    render(<NavBar />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '主题切换' })).toBeInTheDocument()
  })
})
