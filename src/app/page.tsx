'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kaoyan/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-lg pt-4">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">考研英语</h1>
      <p className="mb-6 text-sm text-stone-500">2026考研英语词汇闪过 · {stats?.totalWords || 6098} 词</p>

      {/* Overall progress */}
      {stats && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700">总进度</span>
            <span className="text-stone-500">{stats.learnedCount}/{stats.totalWords}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${stats.totalWords > 0 ? (stats.learnedCount / stats.totalWords * 100) : 0}%` }} />
          </div>
          {stats.dueCount > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              今日复习: {stats.dueCount} 词
            </div>
          )}
        </div>
      )}

      {/* Group sections */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-600">选择学习阶段</p>
        {stats?.groups?.map((g: any) => (
          <button
            key={g.id}
            onClick={() => router.push(`/learn?groupId=${g.id}`)}
            className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-stone-400 active:scale-[0.98]"
          >
            <div>
              <p className="text-sm font-medium text-stone-800">{g.name}</p>
              <p className="mt-0.5 text-xs text-stone-400">{g.total} 词 · {g.learned} 已学</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${g.total > 0 ? (g.learned / g.total * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-stone-400">{g.learned}/{g.total}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {stats?.groups?.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400">
          词库加载中...
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => router.push('/review')}
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          复习 {stats?.dueCount > 0 ? `(${stats.dueCount})` : ''}
        </button>
      </div>
    </div>
  )
}
