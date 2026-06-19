'use client'

import { useState, useEffect } from 'react'
import { cachedFetch } from '@/lib/api-cache'
import InfoButton from '@/components/InfoButton'
import Loading from '@/components/Loading'
import Card from '@/components/Card'

type Stats = {
  overall: { totalWords: number; learnedWords: number; avgMastery: number }
  masteryDistribution: { low: number; medium: number; high: number; mastered: number }
  stages: Array<{ name: string; total: number; learned: number; avgMastery: number }>
  weakGroups: Array<{ id: string; name: string; total: number; learned: number; avgMastery: number }>
  reviewForecast: Array<{ date: string; dueCount: number }>
  dailyActivity: Array<{ date: string; count: number }>
  goalHeatmap?: Array<{ date: string; learned: number; target: number; completed: boolean }>
  streak?: { current: number; longest: number }
}

function maxVal(arr: Array<{ count: number }>): number {
  return Math.max(...arr.map((d) => d.count), 1)
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cachedFetch<Stats>('/api/stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Loading />
  }

  if (!stats) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">无法加载统计数据</div>
  }

  const formatDate = (d: string) => {
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">学习统计</h1>
        <InfoButton>
          <h3 className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-100">学习统计</h3>
          <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            查看学习数据统计，包括总进度、连续打卡天数、掌握分布、各阶段进度、薄弱分组、未来复习量预测和每日学习记录。帮助你了解整体学习情况和趋势。
          </p>
        </InfoButton>
      </div>

      {/* Overall progress */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">总进度</h2>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.overall.learnedWords}</span>
          <span className="text-sm text-stone-400 dark:text-stone-500">/ {stats.overall.totalWords} 词</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400" style={{ width: `${(stats.overall.learnedWords / stats.overall.totalWords) * 100}%` }} />
        </div>
        {stats.overall.avgMastery > 0 && (
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
            平均掌握率 {stats.overall.avgMastery}%
          </p>
        )}
      </Card>

      {/* Streak and daily goal */}
      {stats.streak && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">连续打卡</h2>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.streak.current}</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">当前连续</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.streak.longest}</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">最长连续</p>
            </div>
          </div>
        </Card>
      )}

      {/* Goal heatmap */}
      {stats.goalHeatmap && stats.goalHeatmap.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近 30 天打卡</h2>
          <div className="grid grid-cols-15 gap-[3px]" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
            {stats.goalHeatmap.map((d) => {
              let bg = 'bg-stone-100 dark:bg-stone-800'
              if (d.completed) bg = 'bg-emerald-500 dark:bg-emerald-600'
              else if (d.learned > 0 && d.target > 0) {
                const ratio = d.learned / d.target
                if (ratio >= 0.75) bg = 'bg-emerald-300 dark:bg-emerald-700'
                else if (ratio >= 0.5) bg = 'bg-emerald-200 dark:bg-emerald-800'
                else bg = 'bg-emerald-100 dark:bg-emerald-900'
              }
              return (
                <div
                  key={d.date}
                  className={`aspect-square rounded-sm ${bg}`}
                  title={`${d.date}: ${d.learned}/${d.target}`}
                />
              )
            })}
          </div>
        </Card>
      )}

      {/* Mastery distribution */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">掌握分布</h2>
        <div className="space-y-2">
          {[
            { key: 'mastered', label: '掌握 (75-100%)', color: 'bg-green-500', value: stats.masteryDistribution.mastered },
            { key: 'high', label: '良好 (50-75%)', color: 'bg-emerald-400', value: stats.masteryDistribution.high },
            { key: 'medium', label: '一般 (25-50%)', color: 'bg-amber-400', value: stats.masteryDistribution.medium },
            { key: 'low', label: '初学 (0-25%)', color: 'bg-red-400', value: stats.masteryDistribution.low },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-stone-600 dark:text-stone-400">{item.label}</span>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / Math.max(stats.overall.learnedWords, 1)) * 100}%` }} />
                </div>
              </div>
              <span className="w-8 text-right text-stone-500 dark:text-stone-400">{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Stage progress */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">各阶段进度</h2>
        <div className="space-y-3">
          {stats.stages.map((s) => (
            <div key={s.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700 dark:text-stone-300">{s.name}</span>
                <span className="text-stone-400 dark:text-stone-500">
                  {s.learned}/{s.total} · {s.avgMastery}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400" style={{ width: `${(s.learned / s.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Weak groups */}
      {stats.weakGroups.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">薄弱分组</h2>
          <div className="space-y-2">
            {stats.weakGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs">
                <span className="text-stone-700 dark:text-stone-300">{g.name}</span>
                <span className="text-red-500 dark:text-red-400">{g.avgMastery}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Review forecast */}
      {stats.reviewForecast.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">未来 7 天复习量</h2>
          <div className="flex items-end gap-1.5" style={{ height: '80px' }}>
            {stats.reviewForecast.map((d) => {
              const max = maxVal(stats.reviewForecast.map((d) => ({ count: d.dueCount })))
              const height = max > 0 ? (d.dueCount / max) * 100 : 0
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{d.dueCount}</span>
                  <div className="w-full rounded-t-md bg-amber-400 dark:bg-amber-600" style={{ height: `${height}%`, minHeight: d.dueCount > 0 ? '4px' : '0' }} />
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatDate(d.date)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Daily activity */}
      {stats.dailyActivity.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近 30 天学习记录</h2>
          <div className="flex items-end gap-[3px]" style={{ height: '60px' }}>
            {stats.dailyActivity.map((d) => {
              const max = maxVal(stats.dailyActivity)
              const height = max > 0 ? (d.count / max) * 100 : 0
              return (
                <div
                  key={d.date}
                  className="flex-1 rounded-t-sm bg-stone-400 dark:bg-stone-500"
                  style={{ height: `${height}%`, minHeight: d.count > 0 ? '2px' : '0' }}
                  title={`${d.date}: ${d.count} 词`}
                />
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-stone-400 dark:text-stone-500">
            <span>{stats.dailyActivity[0]?.date?.slice(5) || ''}</span>
            <span>{stats.dailyActivity[stats.dailyActivity.length - 1]?.date?.slice(5) || ''}</span>
          </div>
        </Card>
      )}
    </div>
  )
}
