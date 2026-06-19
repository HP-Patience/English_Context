'use client'

import { useState, useEffect } from 'react'
import { cachedFetch } from '@/lib/api-cache'
import Loading from '@/components/Loading'
import Card from '@/components/Card'

type Analysis = {
  topFailed: Array<{
    userWordMeaningId: string
    word: string
    partOfSpeech: string
    definitionCn: string | null
    failCount: number
    lastFailedAt: string | null
  }>
  lowestMastery: Array<{
    userWordMeaningId: string
    word: string
    partOfSpeech: string
    definitionCn: string | null
    mastery: number
    easeFactor: number
    nextReviewAt: string
  }>
  trend: {
    avgMastery: number
    avgInterval: number
    recentPassRate: Array<{ date: string; rate: number }>
    needsAttention: number
  }
}

export default function AnalysisPanel() {
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cachedFetch<Analysis>('/api/review/analysis')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Loading />
  }

  if (!data?.trend) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">暂无数据</div>
  }

  const maxRate = Math.max(...data.trend.recentPassRate.map((d) => d.rate), 10)
  const points = data.trend.recentPassRate
    .map((d, i) => {
      const x = (i / (data.trend.recentPassRate.length - 1 || 1)) * 280
      const y = 50 - (d.rate / maxRate) * 40
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '平均掌握度', value: `${data.trend.avgMastery}%`, color: 'text-stone-900 dark:text-stone-100' },
          { label: '7天通过率', value: `${data.trend.recentPassRate.length > 0 ? Math.round(data.trend.recentPassRate.reduce((s, d) => s + d.rate, 0) / data.trend.recentPassRate.length) : 0}%`, color: 'text-stone-900 dark:text-stone-100' },
          { label: '需关注词', value: `${data.trend.needsAttention}`, color: data.trend.needsAttention > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Trend line */}
      {data.trend.recentPassRate.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近7天通过率</h2>
          <svg viewBox="0 0 280 60" className="w-full" style={{ height: '80px' }}>
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              className="stroke-stone-900 dark:stroke-stone-300"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.trend.recentPassRate.map((d, i) => (
              <circle
                key={d.date}
                cx={(i / (data.trend.recentPassRate.length - 1 || 1)) * 280}
                cy={50 - (d.rate / maxRate) * 40}
                r="3"
                className="fill-stone-900 dark:fill-stone-300"
              />
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-stone-400 dark:text-stone-500">
            <span>{data.trend.recentPassRate[0]?.date?.slice(5)}</span>
            <span>{data.trend.recentPassRate[data.trend.recentPassRate.length - 1]?.date?.slice(5)}</span>
          </div>
        </Card>
      )}

      {/* Top failed words */}
      {data.topFailed.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">高频错词 Top 20</h2>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {data.topFailed.map((item) => (
              <div key={item.userWordMeaningId} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {item.word}
                    <span className="ml-1 text-xs font-normal text-stone-400 dark:text-stone-500">{item.partOfSpeech}</span>
                  </p>
                  {item.definitionCn && (
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">{item.definitionCn}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {item.failCount}次
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lowest mastery words */}
      {data.lowestMastery.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">掌握度最低 Top 20</h2>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {data.lowestMastery.map((item) => (
              <div key={item.userWordMeaningId} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {item.word}
                    <span className="ml-1 text-xs font-normal text-stone-400 dark:text-stone-500">{item.partOfSpeech}</span>
                  </p>
                  {item.definitionCn && (
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">{item.definitionCn}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {item.mastery}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {data.topFailed.length === 0 && data.lowestMastery.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          还没有足够的复习数据，多做些复习再来查看。
        </div>
      )}
    </div>
  )
}
