'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PronounceButton from '@/components/PronounceButton'
import { cachedFetch, invalidateCache } from '@/lib/api-cache'

type ReviewItem = {
  id: string
  mastery: number
  wordMastery: number
  meaning: { id: string; partOfSpeech: string; definition: string; definitionCn: string | null }
  userWord: { word: { text: string; id: string }; bookmarked: boolean; wordId: string }
  sentences: Array<{ sentenceText: string; sentenceCn: string | null; contextTopic: string | null }>
}

export default function ReviewPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [idx, setIdx] = useState(0)
  const [selfRate, setSelfRate] = useState<'clear' | 'vague' | 'forgot' | null>(null)
  const [showDef, setShowDef] = useState(false)
  const [showForgotAfterClear, setShowForgotAfterClear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({})

  useEffect(() => {
    cachedFetch<ReviewItem[]>('/api/review-queue')
      .then((data) => {
        setQueue(data)
        const bm: Record<string, boolean> = {}
        data.forEach((d: ReviewItem) => { bm[d.userWord.word.id] = d.userWord.bookmarked })
        setBookmarks(bm)
        setLoading(false)
        if (data.length === 0) setDone(true)
      })
      .catch(() => setLoading(false))
  }, [])

  const item = queue[idx]

  function getSentence(): { text: string; cn: string | null } {
    if (!item) return { text: '', cn: null }
    const sorted = [...item.sentences].sort((a) => (a.contextTopic === 'interest_tuned' ? -1 : 1))
    return { text: sorted[0]?.sentenceText ?? '', cn: sorted[0]?.sentenceCn ?? null }
  }

  function highlightWord(sentence: string, word: string): string[] {
    const re = new RegExp(`(${word})`, 'gi')
    return sentence.replace(re, '==$1==').split(/(==[^=]+==)/g)
  }

  function handleRate(rate: 'clear' | 'vague' | 'forgot') {
    setSelfRate(rate)
    setShowDef(true)
    if (rate === 'clear') setShowForgotAfterClear(true)
  }

  function handleForgotAfterClear() {
    setShowForgotAfterClear(false)
    setSelfRate('forgot')
  }

  function gradeFromRate(rate: 'clear' | 'vague' | 'forgot'): number {
    switch (rate) {
      case 'clear': return 4
      case 'vague': return 2
      case 'forgot': return 0
    }
  }

  async function toggleBookmark(wordId: string) {
    try {
      const res = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.bookmarked !== undefined) {
          setBookmarks((prev) => ({ ...prev, [wordId]: data.bookmarked }))
        }
      }
    } catch {}
  }

  async function handleNext() {
    if (!item) return
    setSubmitting(true)
    try {
      await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWordMeaningId: item.id,
          grade: gradeFromRate(selfRate!),
          sentenceText: getSentence().text,
          flippedToForgot: selfRate === 'forgot',
        }),
      })
      invalidateCache('/api/kaoyan/stats')
      invalidateCache('/api/daily-goal')
      invalidateCache('/api/stats')
      invalidateCache('/api/review/analysis')
    } catch {}
    setSubmitting(false)
    if (idx < queue.length - 1) {
      setIdx((i) => i + 1)
      setSelfRate(null)
      setShowDef(false)
      setShowForgotAfterClear(false)
    } else {
      setDone(true)
    }
  }

  if (loading) return <p className="text-center text-stone-500 dark:text-stone-400">加载中...</p>

  if (done) {
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="mb-1 text-5xl font-light text-stone-300 dark:text-stone-600">✓</p>
        <h2 className="mb-1 text-xl font-semibold">复习完成</h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">完成了 {idx} 个单词</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => router.push('/learn')} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">查看单词</button>
          <button onClick={() => router.push('/')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">学新词</button>
          <button onClick={() => router.push('/review/analysis')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">错词分析</button>
        </div>
      </div>
    )
  }

  if (!item && queue.length === 0) {
    return (
      <div className="mx-auto max-w-lg pt-12 text-center">
        <p className="mb-1 text-5xl font-light text-stone-300 dark:text-stone-600">📚</p>
        <h2 className="mb-1 text-xl font-semibold">暂无复习</h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">学些新词再来</p>
        <button onClick={() => router.push('/')} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">学新词</button>
      </div>
    )
  }

  const sentence = getSentence()
  const word = item.userWord.word.text
  const parts = sentence.text ? highlightWord(sentence.text, word) : []

  return (
    <div className="mx-auto max-w-lg">
      {/* progress bar */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 flex-1 rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-1 rounded-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${((idx + 1) / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs text-stone-400 dark:text-stone-500">{idx + 1}/{queue.length}</span>
      </div>

      {/* sentence */}
      <div className="mb-6">
        {sentence.text && (
          <p className="text-lg leading-relaxed text-stone-800 dark:text-stone-200">
            {parts.map((part, i) =>
              part.startsWith('==') && part.endsWith('==') ? (
                <span key={i} className="font-semibold text-amber-600 underline decoration-amber-300 decoration-2 underline-offset-4">
                  {part.slice(2, -2)}
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>
        )}
      </div>

      {/* self-assessment */}
      {!showDef ? (
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => handleRate('clear')}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center text-xs font-medium text-stone-600 shadow-sm transition hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-stone-600"
          >
            <span className="mx-auto mb-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-[10px] text-green-600 dark:bg-green-900 dark:text-green-400">✓</span>
            清楚
          </button>
          <button
            onClick={() => handleRate('vague')}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center text-xs font-medium text-stone-600 shadow-sm transition hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-stone-600"
          >
            <span className="mx-auto mb-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] text-amber-600 dark:bg-amber-900 dark:text-amber-400">~</span>
            模糊
          </button>
          <button
            onClick={() => handleRate('forgot')}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center text-xs font-medium text-stone-600 shadow-sm transition hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none dark:hover:border-stone-600"
          >
            <span className="mx-auto mb-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] text-red-600 dark:bg-red-900 dark:text-red-400">✗</span>
            忘记
          </button>
        </div>
      ) : (
        /* definition panel */
        <div className="space-y-4">
          {/* Word header with mastery */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{item.userWord.word.text}</h2>
              <PronounceButton word={item.userWord.word.text} />
              <button
                onClick={() => toggleBookmark(item.userWord.word.id)}
                className={`text-base ${bookmarks[item.userWord.word.id] ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400 dark:text-stone-600 dark:hover:text-amber-400'}`}
                title={bookmarks[item.userWord.word.id] ? '取消收藏' : '收藏'}
              >
                {bookmarks[item.userWord.word.id] ? '★' : '☆'}
              </button>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              掌握 {item.wordMastery}%
            </span>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {item.meaning.partOfSpeech}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500">{item.mastery}%</span>
            </div>
            <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{item.meaning.definition}</p>
            {item.meaning.definitionCn && (
              <p className="mt-2 border-t border-stone-100 pt-2 text-sm font-medium text-stone-900 dark:border-stone-800 dark:text-stone-100">
                {item.meaning.definitionCn}
              </p>
            )}
          </div>

          {sentence.cn && (
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
              <span className="mb-1.5 block text-xs font-medium text-stone-400 dark:text-stone-500">译文</span>
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{sentence.cn}</p>
            </div>
          )}

          {showForgotAfterClear && (
            <button
              onClick={handleForgotAfterClear}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-400 shadow-sm transition hover:border-red-200 hover:text-red-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500 dark:shadow-none dark:hover:border-red-400"
            >
              忘记
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={submitting}
            className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 dark:shadow-none"
          >
            {submitting ? '...' : idx < queue.length - 1 ? '继续' : '完成'}
          </button>
        </div>
      )}
    </div>
  )
}
