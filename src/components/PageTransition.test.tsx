/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const route = vi.hoisted(() => ({ path: '/learn' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))
import { PageTransition } from './PageTransition'

beforeEach(() => {
  route.path = '/learn'
  vi.useFakeTimers()
  vi.stubGlobal('isSecureContext', false)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('PageTransition on HTTP', () => {
  it('fades an inert old snapshot and the incoming page without cloning navigation', () => {
    const { rerender, container } = render(<PageTransition><a href="/review" onClick={event => event.preventDefault()}>复习</a><p id="old">旧页面</p></PageTransition>)
    fireEvent.click(screen.getByRole('link', { name: '复习' }))
    route.path = '/review'
    rerender(<PageTransition><p>新页面</p></PageTransition>)
    const snapshot = container.querySelector('.route-fade-snapshot')
    expect(snapshot).toHaveTextContent('旧页面')
    expect(snapshot).toHaveAttribute('aria-hidden', 'true')
    expect(snapshot?.querySelector('[id]')).toBeNull()
    expect(screen.getByText('新页面').parentElement).toHaveClass('route-fade-enter', 'route-fade-delayed')
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
