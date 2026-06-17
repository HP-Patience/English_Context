'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type LearnItem = {
  id: string
  wordId: string
  word: string
  bookmarked: boolean
  pos: string
  definitionCn: string
  wordMastery: number
  meaningMastery: number
  sentence: string | null
  sentenceCn: string | null
  groupId: string
}

export default function LearnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const groupId = searchParams.get('groupId')

  const [item, setItem] = useState<LearnItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)

  const fetchNext = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    setRevealed(false)
    try {
      const res = await fetch(`/api/kaoyan/learn?groupId=${groupId}`)
      const data = await res.json()
      if (data.done) {
        setDone(true)
        setDoneInfo(data)
      } else {
        setItem(data)
        setBookmarked(data.bookmarked ?? false)
      }
    } catch {
      setDone(true)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { if (groupId) fetchNext() }, [groupId, fetchNext])

  async function handleRate(grade: number) {
    if (!item) return
    setRevealed(true)
    await fetch('/api/kaoyan/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWordMeaningId: item.id, grade }),
    })
  }

  async function handleNext() {
    fetchNext()
  }

  if (!groupId) {
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="text-stone-500 dark:text-stone-400">请从首页选择学习阶段</p>
        <button onClick={() => router.push('/')} className="mt-4 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">返回首页</button>
      </div>
    )
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="mb-2 text-5xl font-light text-stone-300 dark:text-stone-600">🎉</p>
        <h2 className="mb-1 text-xl font-semibold">本阶段完成</h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">已学 {doneInfo?.learned || '全部'} 词</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => router.push('/')} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">返回首页</button>
          <button onClick={() => router.push('/review')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">去复习</button>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="text-sm text-stone-400 dark:text-stone-500">暂无学习内容</p>
        <button onClick={() => router.push('/')} className="mt-4 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">返回首页</button>
      </div>
    )
  }

  const sentenceParts = item.sentence
    ? item.sentence.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 === 1
          ? { text: part, highlight: true }
          : { text: part, highlight: false }
      ).filter(p => p.text)
    : []

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-bold">{item.word}</h1>
          <button
            onClick={async () => {
              const res = await fetch('/api/bookmarks/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wordId: item.wordId }),
              })
              const data = await res.json()
              if (data.bookmarked !== undefined) setBookmarked(data.bookmarked)
            }}
            className={`text-lg ${bookmarked ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400 dark:text-stone-600 dark:hover:text-amber-400'}`}
            title={bookmarked ? '取消收藏' : '收藏'}
          >
            {bookmarked ? '★' : '☆'}
          </button>
        </div>
        {revealed && (
          <div className="mt-2 flex items-center justify-center gap-3 text-sm">
            <span className="text-stone-500 dark:text-stone-400">{item.pos}. {item.definitionCn}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">掌握 {item.wordMastery}%</span>
          </div>
        )}
      </div>

      {item.sentence && !revealed && (
        <div className="mb-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
          <p className="text-lg leading-relaxed text-stone-800 dark:text-stone-200">
            {sentenceParts.map((part, i) =>
              part.highlight ? (
                <span key={i} className="font-semibold text-amber-600 underline decoration-amber-300 decoration-2 underline-offset-4">{part.text}</span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </p>
        </div>
      )}

      {revealed && (
        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
            <span className="mb-1.5 block text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">{item.pos}</span>
            <p className="text-base font-medium text-stone-900 dark:text-stone-100">{item.definitionCn}</p>
          </div>
          {item.sentenceCn && (
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
              <span className="mb-1.5 block text-xs font-medium text-stone-400 dark:text-stone-500">译文</span>
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{item.sentenceCn}</p>
            </div>
          )}
        </div>
      )}

      {!revealed ? (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => handleRate(4)} className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center text-sm font-medium text-stone-600 shadow-sm transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-green-600 dark:hover:bg-green-950 dark:hover:text-green-400">
            <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-sm text-green-600 dark:bg-green-900 dark:text-green-400">✓</span>
            清楚
          </button>
          <button onClick={() => handleRate(2)} className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center text-sm font-medium text-stone-600 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-amber-600 dark:hover:bg-amber-950 dark:hover:text-amber-400">
            <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm text-amber-600 dark:bg-amber-900 dark:text-amber-400">~</span>
            模糊
          </button>
          <button onClick={() => handleRate(0)} className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center text-sm font-medium text-stone-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-red-400 dark:hover:bg-red-950 dark:hover:text-red-400">
            <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-sm text-red-600 dark:bg-red-900 dark:text-red-400">✗</span>
            忘记
          </button>
        </div>
      ) : (
        <button onClick={handleNext} disabled={submitting} className="w-full rounded-xl bg-stone-900 px-4 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 dark:shadow-none">
          继续 →
        </button>
      )}

      {!item.sentence && !revealed && (
        <div className="mb-4 text-center text-sm text-stone-400 dark:text-stone-500">例句生成中，先看释义</div>
      )}
    </div>
  )
}
