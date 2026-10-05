/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FadeSwap } from './FadeSwap'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('isSecureContext', false)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('HTTP-compatible content fade', () => {
  it('retains old content for 80ms, blocks duplicate clicks, then renders incoming content', () => {
    const { rerender } = render(<FadeSwap transitionKey="a"><button>旧词</button></FadeSwap>)
    rerender(<FadeSwap transitionKey="b"><button>新词</button></FadeSwap>)
    expect(screen.getByText('旧词').parentElement).toHaveClass('content-fade-exit')
    expect(screen.getByText('旧词').parentElement).toHaveAttribute('inert')
    expect(screen.queryByText('新词')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(80))
    expect(screen.getByText('新词').parentElement).toHaveClass('content-fade-enter')
    expect(screen.getByText('新词').parentElement).not.toHaveAttribute('inert')
  })
  it('uses the most recent old content and cancels obsolete transitions', () => {
    const { rerender } = render(<FadeSwap transitionKey="a"><p>最初</p></FadeSwap>)
    rerender(<FadeSwap transitionKey="a"><p>最新释义</p></FadeSwap>)
    rerender(<FadeSwap transitionKey="b"><p>中间词</p></FadeSwap>)
    expect(screen.getByText('最新释义')).toBeInTheDocument()
    rerender(<FadeSwap transitionKey="c"><p>最后词</p></FadeSwap>)
    act(() => vi.advanceTimersByTime(80))
    expect(screen.getByText('最后词')).toBeInTheDocument()
    expect(screen.queryByText('中间词')).not.toBeInTheDocument()
  })
  it('does not impose animation delays when reduced motion is enabled', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { rerender } = render(<FadeSwap transitionKey="a">旧</FadeSwap>)
    rerender(<FadeSwap transitionKey="b">新</FadeSwap>)
    act(() => vi.advanceTimersByTime(0))
    expect(screen.getByText('新')).toBeInTheDocument()
  })
  it('cleans up pending timers on unmount', () => {
    const { rerender, unmount } = render(<FadeSwap transitionKey="a">旧</FadeSwap>)
    rerender(<FadeSwap transitionKey="b">新</FadeSwap>)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
