/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CompletionDateHistory } from './CompletionDateHistory'

const endpoint = '/api/story/lessons/lesson-1/completions'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

describe('CompletionDateHistory', () => {
  it('appends a saved date with a client completion id and restores an empty picker', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          completions: [{ id: 'event-1', completionId: 'first', date: '2026-08-18', createdAt: '2026-08-18T00:00:00.000Z' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          completion: { id: 'event-2', completionId: 'second', date: '2026-08-19', createdAt: '2026-08-19T00:00:00.000Z' },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<CompletionDateHistory endpoint={endpoint} label="篇章完成日期" />)

    expect(await screen.findByRole('list', { name: '已保存日期' })).toHaveTextContent('2026-08-18')
    const picker = screen.getByLabelText('篇章完成日期')
    const savedDate = screen.getByRole('button', { name: '选择日期 2026-08-18' })
    expect(savedDate).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(savedDate)
    expect(savedDate).toHaveAttribute('aria-pressed', 'true')
    expect(picker).toHaveValue('2026-08-18')
    fireEvent.change(picker, { target: { value: '2026-08-19' } })
    fireEvent.click(screen.getByRole('button', { name: '保存日期' }))

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"date":"2026-08-19"'),
    })))
    const postBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(postBody).toEqual({ completionId: expect.any(String), date: '2026-08-19' })
    expect(await screen.findByRole('list', { name: '已保存日期' })).toHaveTextContent('2026-08-19')
    expect(picker).toHaveValue('')
    expect(screen.getAllByLabelText('篇章完成日期')).toHaveLength(1)
  })

  it('retains the selected date and offers inline retry after a failed save', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ completions: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'failed' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          completion: { id: 'event-1', completionId: 'retry', date: '2026-08-20', createdAt: '2026-08-20T00:00:00.000Z' },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<CompletionDateHistory endpoint={endpoint} label="篇章完成日期" />)

    const picker = await screen.findByLabelText('篇章完成日期')
    fireEvent.change(picker, { target: { value: '2026-08-20' } })
    fireEvent.click(screen.getByRole('button', { name: '保存日期' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('日期未能保存')
    expect(picker).toHaveValue('2026-08-20')
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))

    expect(await screen.findByRole('list', { name: '已保存日期' })).toHaveTextContent('2026-08-20')
    expect(picker).toHaveValue('')
  })

  it('disables mutation while offline without discarding loaded history', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        completions: [{ id: 'event-1', completionId: 'first', date: '2026-08-18', createdAt: '2026-08-18T00:00:00.000Z' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CompletionDateHistory endpoint={endpoint} label="篇章完成日期" />)

    expect(await screen.findByRole('list', { name: '已保存日期' })).toHaveTextContent('2026-08-18')
    expect(screen.getByRole('status')).toHaveTextContent('离线时不能保存新的完成日期')
    expect(screen.getByRole('button', { name: '离线不可保存' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows summary without loading lazy history until the user expands it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ completions: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(
      <StrictMode>
        <CompletionDateHistory
          endpoint={endpoint}
          label="篇章完成日期"
          initialCount={2}
          latestDate="2026-08-18"
          lazy
        />
      </StrictMode>,
    )

    expect(screen.getByText(/已记录/)).toHaveTextContent('已记录 2 次 · 最近 2026-08-18')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('篇章完成日期')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '记录或查看篇章完成日期历史' }))

    expect(await screen.findByLabelText('篇章完成日期')).toHaveValue('')
    expect(fetchMock).toHaveBeenCalledOnce()

    view.rerender(
      <StrictMode>
        <CompletionDateHistory
          endpoint={endpoint}
          label="篇章完成日期"
          initialCount={2}
          latestDate="2026-08-18"
          lazy
        />
      </StrictMode>,
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('renders every returned completion after lazy expansion', async () => {
    const completions = Array.from({ length: 30 }, (_, index) => ({
      id: `event-${index}`,
      completionId: `completion-${index}`,
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      createdAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ completions }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CompletionDateHistory endpoint={endpoint} label="篇章完成日期" lazy />)

    fireEvent.click(screen.getByRole('button', { name: '记录或查看篇章完成日期历史' }))

    expect(await screen.findAllByRole('button', { name: /选择日期/ })).toHaveLength(30)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
