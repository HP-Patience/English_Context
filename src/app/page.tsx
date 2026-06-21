'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cachedFetch } from '@/lib/api-cache'
import Loading from '@/components/Loading'
import Card from '@/components/Card'
import { getStage, STAGE_ORDER } from '@/lib/stages'

interface BeforeInstallPromptEvent {
  prompt: () => void
  userChoice: Promise<{ outcome: string }>
}

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [dailyGoal, setDailyGoal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const dismissedAt = localStorage.getItem('pwa-install-dismissed')
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallBanner(false)
    if (outcome === 'accepted') {
      localStorage.removeItem('pwa-install-dismissed')
    }
  }

  useEffect(() => {
    cachedFetch('/api/kaoyan/stats')
      .then((data: any) => {
        setStats(data)
        if (data.dailyGoal) setDailyGoal(data.dailyGoal)
      })
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

  const prefetchLearn = useCallback((() => {
    let timer: ReturnType<typeof setTimeout>
    return (groupId: string, r?: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const url = `/learn?groupId=${groupId}${r ? `&round=${r}` : ''}`
        router.prefetch(url)
        cachedFetch(`/api/kaoyan/learn${r ? `?groupId=${groupId}&round=${r}` : `?groupId=${groupId}`}`).catch(() => {})
      }, 100)
    }
  })(), [router])

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-lg pt-4">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">考研英语</h1>
      <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">2026考研英语词汇闪过 · {stats?.totalWords || 6098} 词</p>

      {/* Daily goal progress */}
      {dailyGoal && (
        <Card className="mb-6">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              🔥 连续 {dailyGoal.streak?.current ?? 0} 天
            </span>
            <span className="text-stone-500 dark:text-stone-400">
              今日 {dailyGoal.learned}/{dailyGoal.target} 词
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400"
              style={{
                width: `${dailyGoal.target > 0 ? Math.min(100, (dailyGoal.learned / dailyGoal.target) * 100) : 0}%`,
              }}
            />
          </div>
          {dailyGoal.reviewed > 0 && (
            <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
              已复习 {dailyGoal.reviewed} 词
            </p>
          )}
          {dailyGoal.completed && (
            <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">
              ✓ 今日目标达成
            </p>
          )}
        </Card>
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
                    <div key={g.id} className="flex items-stretch">
                      <button
                        onClick={() => router.push(`/learn?groupId=${g.id}${g.currentRound > 0 ? `&round=${g.currentRound}` : ''}`)}
                        onMouseEnter={() => prefetchLearn(g.id, g.currentRound)}
                        className="flex flex-1 items-center justify-between px-4 py-3 pl-8 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800"
                      >
                        <div>
                          <p className="text-sm text-stone-700 dark:text-stone-300">{g.name}</p>
                          <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                            {g.total} 词 · {g.learned} 已学{g.currentRound > 0 ? ` · 第 ${g.currentRound} 轮` : ''}
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
                      <Link
                        href={`/list/${g.id}`}
                        className="flex items-center border-l border-stone-100 px-3 text-xs text-stone-400 transition hover:text-stone-600 dark:border-stone-700 dark:hover:text-stone-300"
                      >
                        列表
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {stages.length === 0 && (
        <Loading text="词库加载中..." />
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

      {/* PWA install banner */}
      {showInstallBanner && (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              添加到主屏幕，随时随地背单词
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                安装
              </button>
              <button
                onClick={() => {
                  setShowInstallBanner(false)
                  localStorage.setItem('pwa-install-dismissed', String(Date.now()))
                }}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-600 dark:border-stone-700 dark:hover:text-stone-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
