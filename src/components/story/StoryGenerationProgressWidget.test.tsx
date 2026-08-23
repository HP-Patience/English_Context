/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StoryGenerationProgressWidget } from './StoryGenerationProgressWidget'

const runningProgress = {
  available: true,
  status: 'running',
  statusText: '正在生成第 12 篇：花酒遗藏。',
  currentLesson: 12,
  completedLessons: 20,
  totalLessons: 80,
  percent: 25,
  elapsedMs: 125000,
  etaMs: 3600000,
  startedAt: '2026-08-23T01:00:00.000Z',
  updatedAt: '2026-08-23T01:02:05.000Z',
  lastCompletedLesson: 20,
  courseId: 'course-1',
  courseVersion: 2,
  source: 'snapshot',
  snapshotPath: 'scripts/.story-cache/story-generation-progress.json',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StoryGenerationProgressWidget', () => {
  it('polls story generation progress and displays lesson, timing, ETA and status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ progress: runningProgress }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<StoryGenerationProgressWidget pollIntervalMs={60_000} />)

    expect(screen.getByRole('heading', { name: '故事生成炉' })).toBeInTheDocument()
    expect(await screen.findByText('正在生成第 12 篇：花酒遗藏。')).toBeInTheDocument()
    expect(screen.getByText('生成中')).toBeInTheDocument()
    expect(screen.getByText('第 12 / 80 篇')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('2 分 05 秒')).toBeInTheDocument()
    expect(screen.getByText('1 小时 00 分')).toBeInTheDocument()
    expect(screen.getByText(/story-generation-progress\.json/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '故事生成进度' })).toHaveAttribute('aria-valuetext', '已生成 20 篇，共 80 篇')
    expect(fetchMock).toHaveBeenCalledWith('/api/story/generation-progress', expect.objectContaining({ cache: 'no-store' }))
  })

  it('keeps the card visible when no generation snapshot exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        progress: {
          available: false,
          status: 'idle',
          statusText: '尚未发现故事生成进度快照。',
          currentLesson: null,
          completedLessons: 0,
          totalLessons: null,
          percent: null,
          elapsedMs: null,
          etaMs: null,
          startedAt: null,
          updatedAt: null,
          lastCompletedLesson: null,
          courseId: null,
          courseVersion: null,
          source: 'missing',
          snapshotPath: null,
        },
      }), { status: 200 }),
    ))

    render(<StoryGenerationProgressWidget pollIntervalMs={60_000} />)

    expect(await screen.findByText('尚未发现故事生成进度快照。')).toBeInTheDocument()
    expect(screen.getByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('暂无快照')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows a retrying error state when the API cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<StoryGenerationProgressWidget pollIntervalMs={60_000} />)

    await waitFor(() => expect(screen.getByText('读取异常')).toBeInTheDocument())
    expect(screen.getByText('无法读取生成进度，稍后会自动重试。')).toBeInTheDocument()
  })
})
