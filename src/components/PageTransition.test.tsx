/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const route = vi.hoisted(() => ({ path: '/learn' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))
import { PageTransition } from './PageTransition'
import Link from 'next/link'

beforeEach(() => {
  route.path = '/learn'
  vi.useFakeTimers()
  vi.stubGlobal('isSecureContext', false)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('PageTransition on HTTP', () => {
  it('fades an inert old snapshot and the incoming page without cloning navigation', () => {
    const { rerender, container } = render(<PageTransition><Link href="/review" onClick={event => event.preventDefault()}>复习</Link><p id="old">旧页面</p></PageTransition>)
    fireEvent.click(screen.getByRole('link', { name: '复习' }))
    route.path = '/review'
    rerender(<PageTransition><p>新页面</p></PageTransition>)
    const snapshot = container.querySelector('.route-fade-snapshot')
    expect(snapshot).toHaveTextContent('旧页面')
    expect(snapshot).toHaveAttribute('aria-hidden', 'true')
    expect(snapshot?.querySelector('[id]')).toBeNull()
    expect(screen.getByText('新页面').parentElement).toHaveClass('route-fade-enter')
    act(() => vi.advanceTimersByTime(200))
    expect(container.querySelector('.route-fade-snapshot')).toBeNull()
    expect(screen.getByText('新页面').parentElement).not.toHaveClass('route-fade-enter')
  })
  it('does not animate data updates within the same page', () => {
    const { rerender } = render(<PageTransition><p>数据一</p></PageTransition>)
    rerender(<PageTransition><p>数据二</p></PageTransition>)
    expect(screen.getByText('数据二').parentElement).not.toHaveClass('route-fade-enter')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('skips snapshots and route animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { rerender, container } = render(<PageTransition><p>旧</p></PageTransition>)
    route.path = '/review'
    rerender(<PageTransition><p>新</p></PageTransition>)
    expect(container.querySelector('.route-fade-snapshot')).toBeNull()
    expect(screen.getByText('新').parentElement).not.toHaveClass('route-fade-enter')
  })
})

it('keeps the old page visible throughout a slow load and starts just one fade when ready', async () => {
  const { rerender, container } = render(<PageTransition><Link href="/word/test" onClick={event => event.preventDefault()}>查看单词</Link><p>已加载旧页面</p></PageTransition>)
  fireEvent.click(screen.getByRole('link', { name: '查看单词' }))
  route.path = '/word/test'
  rerender(<PageTransition><div data-page-loading="">加载中</div></PageTransition>)
  const panel = screen.getByText('加载中').parentElement!
  expect(panel.style.visibility).toBe('hidden')
  expect(container.querySelector('.route-fade-hold')).toHaveTextContent('已加载旧页面')
  act(() => vi.advanceTimersByTime(2000))
  expect(container.querySelector('.route-fade-hold')).not.toBeNull()
  expect(panel).not.toHaveClass('route-fade-enter')
  rerender(<PageTransition><p>准备好的新页面</p></PageTransition>)
  await act(async () => {})
  expect(panel.style.visibility).toBe('')
  expect(panel).toHaveClass('route-fade-enter')
  expect(container.querySelector('.route-fade-hold')).toBeNull()
  expect(container.querySelector('.route-fade-snapshot')).not.toBeNull()
  act(() => vi.advanceTimersByTime(120))
  expect(container.querySelector('.route-fade-snapshot')).toBeNull()
})

it('reveals load errors rather than holding the old page forever', async () => {
  const { rerender, container } = render(<PageTransition><Link href="/review" onClick={event => event.preventDefault()}>去复习</Link><p>旧页面</p></PageTransition>)
  fireEvent.click(screen.getByRole('link', { name: '去复习' }))
  route.path = '/review'
  rerender(<PageTransition><div data-page-loading="">加载中</div></PageTransition>)
  rerender(<PageTransition><p role="alert">加载失败，请重试</p></PageTransition>)
  await act(async () => {})
  expect(screen.getByRole('alert').parentElement?.style.visibility).toBe('')
  act(() => vi.advanceTimersByTime(120))
  expect(container.querySelector('.route-fade-snapshot')).toBeNull()
})

it('retains the same outgoing page when navigating again during a pending load', () => {
  const view = (child: React.ReactNode) => <><Link href="/stats" onClick={event => event.preventDefault()}>统计</Link><PageTransition>{child}</PageTransition></>
  const { rerender, container } = render(view(<><Link href="/review" onClick={event => event.preventDefault()}>复习</Link><p>稳定的旧页面</p></>))
  fireEvent.click(screen.getByRole('link', { name: '复习' }))
  route.path = '/review'
  rerender(view(<div data-page-loading="">等待复习</div>))
  fireEvent.click(screen.getByRole('link', { name: '统计' }))
  route.path = '/stats'
  rerender(view(<div data-page-loading="">等待统计</div>))
  expect(container.querySelector('.route-fade-hold')).toHaveTextContent('稳定的旧页面')
  expect(container.querySelectorAll('.route-fade-snapshot')).toHaveLength(1)
})
