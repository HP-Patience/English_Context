'use client'

import { useEffect, useState } from 'react'

import {
  getStoryOfflineStatus,
  prepareStoryOffline,
} from '@/lib/story-offline-cache'
import type { StoryOfflineStatus } from '@/lib/story-offline-cache'

type PreparationState = StoryOfflineStatus
  | { readonly kind: 'checking' }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'error'; readonly message: string }

export function StoryOfflinePreparation() {
  const [state, setState] = useState<PreparationState>({ kind: 'checking' })

  useEffect(() => {
    let isActive = true
    void getStoryOfflineStatus()
      .then((status) => {
        if (isActive) setState(status)
      })
      .catch((error: unknown) => {
        if (!isActive) return
        setState({ kind: 'error', message: error instanceof Error ? error.message : '无法读取离线状态' })
      })
    return () => {
      isActive = false
    }
  }, [])

  async function prepare() {
    setState({ kind: 'preparing' })
    try {
      setState(await prepareStoryOffline())
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : '离线准备失败' })
    }
  }

  const isPreparing = state.kind === 'preparing'

  return (
    <section
      aria-labelledby="story-offline-title"
      className="rounded-2xl border border-stone-300 bg-white px-5 py-4 dark:border-stone-700 dark:bg-stone-900 sm:px-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-stone-400 dark:text-stone-500">
            Offline course
          </p>
          <h2 id="story-offline-title" className="mt-1 font-serif text-lg font-semibold text-stone-900 dark:text-stone-100">
            离线故事
          </h2>
          <p role="status" className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">
            {state.kind === 'checking' && '正在检查离线状态…'}
            {state.kind === 'unsupported' && '当前浏览器不支持离线准备'}
            {state.kind === 'missing' && '尚未准备离线故事'}
            {state.kind === 'preparing' && '正在下载完整课程与离线阅读器…'}
            {state.kind === 'ready' && `已准备 ${state.lessonCount} 篇故事（课程版本 ${state.courseVersion}）`}
            {state.kind === 'error' && `准备失败：${state.message}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {state.kind === 'ready' && (
            <a
              href="/story-offline.html"
              className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              打开离线阅读器
            </a>
          )}
          {state.kind !== 'unsupported' && (
            <button
              type="button"
              disabled={isPreparing || state.kind === 'checking'}
              onClick={prepare}
              className="min-h-11 rounded-xl bg-red-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-red-800 dark:hover:bg-red-700 dark:focus-visible:ring-offset-stone-900"
            >
              {isPreparing ? '准备中…' : state.kind === 'ready' ? '更新离线课程' : '准备离线阅读'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
