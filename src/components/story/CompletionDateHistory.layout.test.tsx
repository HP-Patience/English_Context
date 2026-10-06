/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompletionDateHistory } from './CompletionDateHistory'

beforeEach(() => Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('stable collapsed learning history', () => {
  it('keeps the summary and fixed-width button while waiting, then expands once', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
    render(<CompletionDateHistory endpoint="/history" label="篇章完成日期" initialCount={0} summaryLabel="本篇已学习" lazy manageable />)
    const section = screen.getByRole('region', { name: '篇章完成日期历史' })
    const button = screen.getByRole('button', { name: '记录或查看篇章完成日期历史' })
    expect(fetch).not.toHaveBeenCalled()
    const structure = section.querySelectorAll('*').length
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveClass('w-28')
    expect(section.querySelectorAll('*')).toHaveLength(structure)
    expect(screen.queryByText('还没有学习记录。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '记录今天' })).not.toBeInTheDocument()
    finish({ ok: true, json: async () => ({ completions: [] }) })
    expect(await screen.findByRole('button', { name: '记录今天' })).toBeEnabled()
    expect(screen.getByText('还没有学习记录。')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not open an empty editor on failure and allows retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ completions: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CompletionDateHistory endpoint="/history" label="篇章完成日期" initialCount={2} lazy manageable />)
    fireEvent.click(screen.getByRole('button', { name: '记录或查看篇章完成日期历史' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
    expect(screen.queryByRole('button', { name: '记录今天' })).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: '记录或查看篇章完成日期历史' })
    expect(retry).toBeEnabled()
    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: '记录今天' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
