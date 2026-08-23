'use client'

import { useEffect, useState } from 'react'

import type { StoryGenerationProgress } from '@/lib/story-generation-progress'

type StoryGenerationProgressWidgetProps = {
  endpoint?: string
  pollIntervalMs?: number
}

type ProgressState = {
  progress: StoryGenerationProgress | null
  isLoading: boolean
  error: string | null
}

type ProgressApiResponse = {
  progress?: StoryGenerationProgress
  error?: string
}

const DEFAULT_ENDPOINT = '/api/story/generation-progress'
const DEFAULT_POLL_INTERVAL_MS = 3000

function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分`
  if (minutes > 0) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`
  return `${seconds} 秒`
}

function statusBadge(progress: StoryGenerationProgress | null, error: string | null) {
  if (error) return { copy: '读取异常', className: 'bg-red-950 text-red-50 dark:bg-red-900' }
  if (!progress) return { copy: '读取中', className: 'bg-stone-800 text-stone-50 dark:bg-stone-700' }
  if (!progress.available) return { copy: '未开始', className: 'bg-stone-800 text-stone-50 dark:bg-stone-700' }
  if (progress.status === 'completed') return { copy: '已完成', className: 'bg-red-900 text-red-50 dark:bg-red-800' }
  if (progress.status === 'failed') return { copy: '异常', className: 'bg-red-950 text-red-50 dark:bg-red-900' }
  if (progress.status === 'running') return { copy: '生成中', className: 'bg-amber-700 text-amber-50 dark:bg-amber-600' }
  return { copy: '待确认', className: 'bg-stone-800 text-stone-50 dark:bg-stone-700' }
}

function lessonLabel(progress: StoryGenerationProgress | null) {
  if (!progress) return '读取中'
  if (!progress.available) return '暂无快照'
  const total = progress.totalLessons ? ` / ${progress.totalLessons}` : ''
  if (progress.currentLesson !== null) return `第 ${progress.currentLesson}${total} 篇`
  return `${progress.completedLessons}${total} 篇已完成`
}

export function StoryGenerationProgressWidget({
  endpoint = DEFAULT_ENDPOINT,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: StoryGenerationProgressWidgetProps) {
  const [{ progress, isLoading, error }, setState] = useState<ProgressState>({
    progress: null,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    async function load() {
      controller?.abort()
      controller = new AbortController()
      setState((current) => ({ ...current, isLoading: current.progress === null, error: null }))

      try {
        const response = await fetch(endpoint, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = (await response.json()) as ProgressApiResponse
        if (!payload.progress) throw new Error(payload.error ?? 'Missing progress payload')
        if (!disposed) {
          setState({ progress: payload.progress, isLoading: false, error: null })
        }
      } catch (fetchError) {
        if (disposed || (fetchError instanceof DOMException && fetchError.name === 'AbortError')) return
        setState((current) => ({
          progress: current.progress,
          isLoading: false,
          error: '无法读取生成进度，稍后会自动重试。',
        }))
      } finally {
        if (!disposed) timer = setTimeout(load, pollIntervalMs)
      }
    }

    void load()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [endpoint, pollIntervalMs])

  const badge = statusBadge(progress, error)
  const percent = progress?.percent ?? 0
  const elapsed = formatDuration(progress?.elapsedMs ?? null)
  const eta = formatDuration(progress?.etaMs ?? null)
  const hasProgressbar = progress?.totalLessons !== null && progress?.totalLessons !== undefined && progress.totalLessons > 0
  const progressMax = progress?.totalLessons ?? 100
  const progressNow = progress ? Math.min(progress.completedLessons, progressMax) : 0
  let updatedAt: string | null = null
  if (progress?.updatedAt) {
    const date = new Date(progress.updatedAt)
    updatedAt = Number.isNaN(date.getTime()) ? null : date.toLocaleString('zh-CN', { hour12: false })
  }

  return (
    <section
      aria-labelledby="story-generation-progress-title"
      className="overflow-hidden rounded-2xl border border-stone-300 bg-stone-100 shadow-sm dark:border-stone-700 dark:bg-stone-900"
    >
      <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-800 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-red-900 dark:text-red-500">
              Generation forge
            </p>
            <h2 id="story-generation-progress-title" className="mt-1 font-serif text-xl font-semibold text-stone-950 dark:text-stone-50">
              故事生成炉
            </h2>
          </div>
          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badge.className}`}>
            {badge.copy}
          </span>
        </div>

        <p role={error || isLoading ? 'status' : undefined} className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
          {error ?? progress?.statusText ?? '正在读取故事生成进度快照……'}
        </p>

        <div
          role="progressbar"
          aria-label="故事生成进度"
          aria-valuemin={0}
          aria-valuemax={hasProgressbar ? progressMax : 100}
          aria-valuenow={hasProgressbar ? progressNow : percent}
          aria-valuetext={hasProgressbar ? `已生成 ${progressNow} 篇，共 ${progressMax} 篇` : `${percent}%`}
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-800"
        >
          <div className="h-full rounded-full bg-red-800 transition-[width] duration-500 dark:bg-red-700" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <dl className="grid gap-px bg-stone-200 text-sm dark:bg-stone-800 sm:grid-cols-4">
        <div className="bg-stone-50 px-4 py-3 dark:bg-stone-950 sm:px-5">
          <dt className="text-[0.68rem] font-medium text-stone-500 dark:text-stone-400">当前篇章</dt>
          <dd className="mt-1 font-semibold tabular-nums text-stone-900 dark:text-stone-100">{lessonLabel(progress)}</dd>
        </div>
        <div className="bg-stone-50 px-4 py-3 dark:bg-stone-950 sm:px-5">
          <dt className="text-[0.68rem] font-medium text-stone-500 dark:text-stone-400">完成比例</dt>
          <dd className="mt-1 font-semibold tabular-nums text-stone-900 dark:text-stone-100">{percent}%</dd>
        </div>
        <div className="bg-stone-50 px-4 py-3 dark:bg-stone-950 sm:px-5">
          <dt className="text-[0.68rem] font-medium text-stone-500 dark:text-stone-400">已用时间</dt>
          <dd className="mt-1 font-semibold tabular-nums text-stone-900 dark:text-stone-100">{elapsed ?? '—'}</dd>
        </div>
        <div className="bg-stone-50 px-4 py-3 dark:bg-stone-950 sm:px-5">
          <dt className="text-[0.68rem] font-medium text-stone-500 dark:text-stone-400">预计剩余</dt>
          <dd className="mt-1 font-semibold tabular-nums text-stone-900 dark:text-stone-100">{eta ?? '—'}</dd>
        </div>
      </dl>

      <p className="border-t border-stone-200 bg-stone-100 px-5 py-3 text-xs leading-5 text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 sm:px-6">
        每隔数秒自动刷新；快照来源：{progress?.source === 'report' ? '最近一次生成报告' : progress?.snapshotPath ?? 'scripts/.story-cache'}
        {updatedAt ? ` · 更新时间 ${updatedAt}` : ''}
      </p>
    </section>
  )
}
