'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

function getStage(name: string): string {
  if (name.startsWith('高频词')) return '高频词'
  if (name.startsWith('中频词')) return '中频词'
  if (name.startsWith('低频词')) return '低频词'
  if (name.startsWith('偶考词')) return '偶考词'
  if (name.startsWith('基础词')) return '基础词'
  if (name.startsWith('补充词')) return '补充词'
  return '其他'
}

const STAGE_ORDER = ['高频词', '中频词', '低频词', '偶考词', '基础词', '补充词']

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(['高频词']))

  useEffect(() => {
    fetch('/api/kaoyan/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Group groups by stage, aggregate stats
  const stages = stats?.groups
    ? (() => {
        const map = new Map<string, { name: string; groups: any[]; total: number; learned: number }>()
        for (const g of stats.groups) {
          const stage = getStage(g.name)
          if (!map.has(stage)) {
            map.set(stage, { name: stage, groups: [], total: 0, learned: 0 })
          }
          const entry = map.get(stage)!
          entry.groups.push(g)
          entry.total += g.total
          entry.learned += g.learned
        }
        return STAGE_ORDER.filter((s) => map.has(s)).map((s) => map.get(s)!)
      })()
    : []

  const toggleStage = (stage: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-lg pt-4">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">考研英语</h1>
      <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">2026考研英语词汇闪过 · {stats?.totalWords || 6098} 词</p>

      {/* Overall progress */}
      {stats && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">总进度</span>
            <span className="text-stone-500 dark:text-stone-400">{stats.learnedCount}/{stats.totalWords}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${stats.totalWords > 0 ? (stats.learnedCount / stats.totalWords * 100) : 0}%` }} />
          </div>
          {stats.dueCount > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              今日复习: {stats.dueCount} 词
            </div>
          )}
        </div>
      )}

      {/* Stage sections (collapsible) */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-600 dark:text-stone-400">选择学习阶段</p>
        {stages.map((stage) => {
          const isExpanded = expandedStages.has(stage.name)
          return (
            <div
              key={stage.name}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none"
            >
              <button
                onClick={() => toggleStage(stage.name)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                <div>
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{stage.name}</p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {stage.total} 词 · {stage.learned} 已学
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-100"
                      style={{
                        width: `${stage.total > 0 ? (stage.learned / stage.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-stone-400 dark:text-stone-500">
                    {stage.learned}/{stage.total}
                  </span>
                  <svg
                    className={`h-4 w-4 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </button>

              {/* Expanded sub-groups */}
              {isExpanded && (
                <div className="border-t border-stone-100 dark:border-stone-700">
                  {stage.groups.map((g: any) => (
                    <button
                      key={g.id}
                      onClick={() => router.push(`/learn?groupId=${g.id}`)}
                      className="flex w-full items-center justify-between px-4 py-3 pl-8 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      <div>
                        <p className="text-sm text-stone-700 dark:text-stone-300">{g.name}</p>
                        <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                          {g.total} 词 · {g.learned} 已学
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                          <div
                            className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-100"
                            style={{
                              width: `${g.total > 0 ? (g.learned / g.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          {g.learned}/{g.total}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {stages.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">词库加载中...</div>
      )}

      {/* Bottom actions */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => router.push('/review')}
          className="text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
        >
          复习 {stats?.dueCount > 0 ? `(${stats.dueCount})` : ''}
        </button>
      </div>
    </div>
  )
}
