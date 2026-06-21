'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PronounceButton from '@/components/PronounceButton'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import SelectionSearch from '@/components/SelectionSearch'
import { highlightWord } from '@/lib/highlight'
import Loading from '@/components/Loading'

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
  round?: number
  roundProgress?: { completed: number; total: number }
}

function LearnPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const groupId = searchParams.get('groupId')
  const roundParam = searchParams.get('round')
  const round = roundParam ? parseInt(roundParam, 10) : 0

  const [item, setItem] = useState<LearnItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState<any>(null)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [selfRate, setSelfRate] = useState<'clear' | 'vague' | 'forgot' | null>(null)
  const [showForgotAfterClear, setShowForgotAfterClear] = useState(false)
  const [stack, setStack] = useState<LearnItem[]>([])
  const [showPrevItem, setShowPrevItem] = useState<LearnItem | null>(null)
  const [startingRound, setStartingRound] = useState(false)

  const fetchNext = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    setRevealed(false)
    try {
      const params = round > 0 ? `?groupId=${groupId}&round=${round}` : `?groupId=${groupId}`
      const res = await fetch(`/api/kaoyan/learn${params}`)
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
  }, [groupId, round])

  useEffect(() => { if (groupId) fetchNext() }, [groupId, fetchNext])

  async function handleRate(grade: number) {
    if (!item) return
    const rate: 'clear' | 'vague' | 'forgot' = grade === 4 ? 'clear' : grade === 2 ? 'vague' : 'forgot'
    setSelfRate(rate)
    setRevealed(true)
    if (rate === 'clear') setShowForgotAfterClear(true)
    await fetch('/api/kaoyan/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWordMeaningId: item.id, grade }),
    })
  }

  function handleForgotAfterClear() {
    if (!item) return
    setShowForgotAfterClear(false)
    setSelfRate('forgot')
    fetch('/api/kaoyan/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userWordMeaningId: item.id, grade: 0, flippedToForgot: true }),
    })
  }

  function handleBack() {
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]
    setStack(s => s.slice(0, -1))
    setShowPrevItem(prev)
  }

  function handleBackToCurrent() {
    setShowPrevItem(null)
  }

  async function handleNext() {
    if (item && selfRate !== null) {
      setStack(s => [...s, item])
    }
    setSelfRate(null)
    setShowForgotAfterClear(false)
    setRevealed(false)
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
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex animate-pulse flex-col items-center gap-3">
          <div className="h-9 w-40 rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-5 w-24 rounded bg-stone-100 dark:bg-stone-800" />
        </div>
        <div className="mb-8 animate-pulse rounded-xl border border-stone-200 p-6 dark:border-stone-700">
          <div className="h-6 w-full rounded bg-stone-100 dark:bg-stone-800" />
          <div className="mt-2 h-6 w-3/4 rounded bg-stone-100 dark:bg-stone-800" />
        </div>
        <div className="grid animate-pulse grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-stone-100 dark:bg-stone-800" />
          ))}
        </div>
      </div>
    )
  }

  if (done) {
    const nextRound = doneInfo?.round != null ? doneInfo.round + 1 : round + 1
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="mb-2 text-5xl font-light text-stone-300 dark:text-stone-600">🎉</p>
        <h2 className="mb-1 text-xl font-semibold">
          {doneInfo?.round ? `第 ${doneInfo.round} 轮完成` : '本阶段完成'}
        </h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">已学 {doneInfo?.learned || '全部'} 词</p>
        <div className="flex flex-col items-center gap-3">
          <div className="flex justify-center gap-3">
            <button onClick={() => router.push('/')} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">返回首页</button>
            <button onClick={() => router.push('/review')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">去复习</button>
          </div>
          <button
            onClick={async () => {
              setStartingRound(true)
              try {
                const res = await fetch('/api/kaoyan/learn/start-round', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ groupId }),
                })
                const data = await res.json()
                if (data.round) {
                  router.push(`/learn?groupId=${groupId}&round=${data.round}`)
                }
              } catch {
                setStartingRound(false)
              }
            }}
            disabled={startingRound}
            className="text-sm font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50 dark:text-amber-400 dark:hover:text-amber-300"
          >
            {startingRound ? '...' : `开始第 ${nextRound} 轮`}
          </button>
        </div>
      </div>
    )
  }

  if (showPrevItem) {
    const prevParts = showPrevItem.sentence ? highlightWord(showPrevItem.sentence, showPrevItem.word) : []
    return (
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl font-bold">{showPrevItem.word}</h1>
            <PronounceButton word={showPrevItem.word} />
          </div>
          <div className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            {showPrevItem.definitionCn}
          </div>
          <span className="mt-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            掌握 {showPrevItem.wordMastery}%
          </span>
        </div>

        {showPrevItem.sentence && (
          <div className="mb-8">
            <div className="mb-1.5 flex justify-end">
              <SentenceTTSButton text={showPrevItem.sentence} />
            </div>
            <SelectionSearch>
              <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
                <p className="text-lg leading-relaxed text-stone-800 dark:text-stone-200">
                  {prevParts.map((part, i) =>
                    part.highlight ? (
                      <span key={i} className="font-semibold text-amber-600 underline decoration-amber-300 decoration-2 underline-offset-4">{part.text}</span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    )
                  )}
                </p>
              </div>
            </SelectionSearch>
          </div>
        )}

        {showPrevItem.sentence && showPrevItem.sentenceCn && (
          <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
            <span className="mb-1.5 block text-xs font-medium text-stone-400 dark:text-stone-500">译文</span>
            <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{showPrevItem.sentenceCn}</p>
          </div>
        )}

        <button onClick={handleBackToCurrent} className="w-full rounded-xl bg-stone-900 px-4 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 dark:shadow-none">
          继续学新词
        </button>
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
    ? highlightWord(item.sentence, item.word)
    : []

  return (
    <div className="mx-auto max-w-lg">
      {round > 0 && item?.roundProgress && (
        <div className="mb-2 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <span>第 {round} 轮</span>
          <span>{item.roundProgress.completed}/{item.roundProgress.total}</span>
        </div>
      )}
      {stack.length > 0 && (
        <div className="mb-4">
          <button onClick={handleBack} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
            ← 上一个
          </button>
        </div>
      )}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-bold">{item.word}</h1>
          <PronounceButton word={item.word} />
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/bookmarks/toggle', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ wordId: item.wordId }),
                })
                if (res.ok) {
                  const data = await res.json()
                  if (data.bookmarked !== undefined) setBookmarked(data.bookmarked)
                }
              } catch {}
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

      {item.sentence && (
        <div className="mb-8">
          <div className="mb-1.5 flex justify-end">
            <SentenceTTSButton text={item.sentence} />
          </div>
          <SelectionSearch>
            <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
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
          </SelectionSearch>
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

      {showForgotAfterClear && (
        <button
          onClick={handleForgotAfterClear}
          className="mb-3 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-400 shadow-sm transition hover:border-red-200 hover:text-red-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500 dark:shadow-none dark:hover:border-red-400"
        >
          忘记
        </button>
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

export default function LearnPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LearnPageContent />
    </Suspense>
  )
}
