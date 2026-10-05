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
describe('HTTP-compatible cross fade', () => {
  it('mounts new content before fading old content out, with no empty intermediate state', () => {
    const { rerender } = render(<FadeSwap transitionKey="a"><button>旧词</button></FadeSwap>)
    rerender(<FadeSwap transitionKey="b"><button>新词</button></FadeSwap>)
    expect(screen.getByText('新词').parentElement).toHaveClass('content-fade-wait')
    act(() => vi.advanceTimersByTime(0))
    expect(screen.getByText('旧词').parentElement).toHaveClass('content-fade-exit')
    expect(screen.getByText('旧词').parentElement).toHaveAttribute('inert')
    expect(screen.getByText('新词').parentElement).toHaveClass('content-fade-enter')
    act(() => vi.advanceTimersByTime(119))
    expect(screen.getByText('旧词')).toBeInTheDocument()
    expect(screen.getByText('新词')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('旧词')).not.toBeInTheDocument()
  })
  it('keeps outgoing content unchanged until incoming data is ready', async () => {
    const { rerender } = render(<FadeSwap transitionKey="a">旧页</FadeSwap>)
    rerender(<FadeSwap transitionKey="b"><div data-page-loading="">加载中</div></FadeSwap>)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByText('旧页')).not.toHaveClass('content-fade-exit')
    expect(screen.getByText('加载中').parentElement).toHaveClass('content-fade-wait')
    rerender(<FadeSwap transitionKey="b"><p>已准备好</p></FadeSwap>)
    await act(async () => {})
    act(() => vi.advanceTimersByTime(0))
    expect(screen.getByText('已准备好').parentElement).toHaveClass('content-fade-enter')
    act(() => vi.advanceTimersByTime(120))
    expect(screen.queryByText('旧页')).not.toBeInTheDocument()
  })
  it('uses the latest old content and cancels obsolete transitions', () => {
    const { rerender } = render(<FadeSwap transitionKey="a"><p>最初</p></FadeSwap>)
    rerender(<FadeSwap transitionKey="a"><p>最新释义</p></FadeSwap>)
    rerender(<FadeSwap transitionKey="b"><p>中间词</p></FadeSwap>)
    rerender(<FadeSwap transitionKey="c"><p>最后词</p></FadeSwap>)
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(120))
    expect(screen.getByText('最后词')).toBeInTheDocument()
    expect(screen.queryByText('中间词')).not.toBeInTheDocument()
  })
  it('does not impose animation delays with reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { rerender } = render(<FadeSwap transitionKey="a">旧</FadeSwap>)
    rerender(<FadeSwap transitionKey="b">新</FadeSwap>)
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(0))
    expect(screen.queryByText('旧')).not.toBeInTheDocument()
    expect(screen.getByText('新')).toBeInTheDocument()
  })
  it('cleans up pending timers on unmount', () => {
    const { rerender, unmount } = render(<FadeSwap transitionKey="a">旧</FadeSwap>)
    rerender(<FadeSwap transitionKey="b">新</FadeSwap>)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
