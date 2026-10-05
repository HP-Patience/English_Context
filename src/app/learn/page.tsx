'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PronounceButton from '@/components/PronounceButton'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import { MemoryRatingButtons, memoryRatingButtonClass } from '@/components/MemoryRatingButtons'
import SelectionSearch from '@/components/SelectionSearch'
import { FadeSwap } from '@/components/FadeSwap'
import { WordBookmarkButton } from '@/components/WordBookmarkButton'
import { invalidateCache } from '@/lib/api-cache'
import { highlightWord } from '@/lib/highlight'

type LearnItem = {
  id: string | null
  meaningId: string
  wordId: string
  word: string
  bookmarked: boolean
  pos: string
  definition: string
  definitionCn: string | null
  sentence: string | null
  listProgress?: { position: number; total: number }
  sentenceCn: string | null
}

function LearnPageContent({ groupId }: { groupId: string | null }) {
  const requestUrl = groupId ? `/api/kaoyan/learn?groupId=${encodeURIComponent(groupId)}` : '/api/kaoyan/learn'
  const [item, setItem] = useState<LearnItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsNext, setNeedsNext] = useState(false)

  const loadNext = useCallback(() => fetch(requestUrl, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('load failed')
      const data = await response.json() as LearnItem | { done: true }
      if ('done' in data && data.done) {
        setNeedsNext(false)
        setDone(true)
        setItem(null)
      } else if ('meaningId' in data && data.meaningId && data.wordId) {
        setItem(data)
        setRating(null)
        setNeedsNext(false)
        setDone(false)
      } else throw new Error('invalid learning response')
    })
    .catch(() => setError('单词加载失败，请重试。'))
    .finally(() => setLoading(false)), [requestUrl])
  useEffect(() => { void loadNext() }, [loadNext])

  async function saveAndNext(grade = rating) {
    if (!item || grade === null || saving) return
    setSaving(true)
    setError(null)
    if (needsNext) { await loadNext(); setSaving(false); return }
    try {
      const response = await fetch('/api/kaoyan/learn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.id ? { userWordMeaningId: item.id, grade } : { meaningId: item.meaningId, grade }),
      })
      if (!response.ok) throw new Error('save failed')
      invalidateCache('/api/kaoyan/stats')
      invalidateCache('/api/review-queue')
      invalidateCache('/api/relearn')
      setNeedsNext(true)
      await loadNext()
    } catch {
      setError('进度未能保存，请重试。当前单词不会被跳过。')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !item) return <div className="mx-auto min-h-48 max-w-lg" aria-busy="true" />
  if (done) return <div className="mx-auto max-w-lg py-8"><h1 className="text-xl font-semibold">暂时没有未背的单词</h1></div>

  return (
    <div className="mx-auto max-w-lg">
      {error ? <p role="alert" className="mb-5 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {!item ? <button type="button" onClick={() => { setError(null); setLoading(true); void loadNext() }} className="min-h-11 rounded-lg border border-stone-300 px-5 text-sm dark:border-stone-700">重试</button> : (
        <FadeSwap transitionKey={item.meaningId}>
          <div className="relative mb-6 flex min-h-9 items-center justify-center px-20">
            <div className="relative min-w-0">
              <h1 className="break-all text-center text-2xl font-semibold"><Link href={`/word/${encodeURIComponent(item.wordId)}`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500">{item.word}</Link></h1>
              <span className="absolute left-full top-1/2 ml-2 inline-flex -translate-y-1/2"><PronounceButton word={item.word} /></span>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <WordBookmarkButton key={item.wordId} wordId={item.wordId} word={item.word} initialBookmarked={item.bookmarked} size="base" />
            </div>
          </div>
          {item.listProgress && item.listProgress.total > 0 ? (
            <div className="mb-6 flex items-center gap-3">
              <div role="progressbar" aria-label="当前 List 学习位置" aria-valuemin={0} aria-valuemax={item.listProgress.total} aria-valuenow={item.listProgress.position}
                aria-valuetext={`第 ${item.listProgress.position} 个词，共 ${item.listProgress.total} 个词`}
                className="h-1 flex-1 rounded-full bg-stone-200 dark:bg-stone-800">
                <div className="h-1 rounded-full bg-stone-900 dark:bg-stone-100" style={{ width: `${Math.min(100, item.listProgress.position / item.listProgress.total * 100)}%` }} />
              </div>
              <span className="text-xs tabular-nums text-stone-400 dark:text-stone-500">{item.listProgress.position}/{item.listProgress.total}</span>
            </div>
          ) : null}
          {item.sentence ? <SelectionSearch><div className="mb-6 flex items-start gap-2">
            <span className="inline-flex h-8 shrink-0 items-center"><SentenceTTSButton text={item.sentence} /></span>
            <p className="min-w-0 flex-1 break-words text-lg leading-8">{highlightWord(item.sentence, item.word).map((part, index) => <span key={index} className={part.highlight ? 'font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 dark:text-amber-400' : undefined}>{part.text}</span>)}</p>
          </div></SelectionSearch> : null}
          {rating === null ? <MemoryRatingButtons value={rating} onChange={setRating} disabled={saving} /> : null}
          {rating !== null ? <div className="mt-6 space-y-4">
            <div className="learn-definition-reveal border-t border-stone-200 pt-4 dark:border-stone-700">
              <p className="mb-1 text-xs text-stone-500">{item.pos}</p>
              <SelectionSearch><p className="text-base leading-7">{item.definitionCn || item.definition}</p></SelectionSearch>
              {item.sentenceCn ? <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.sentenceCn}</p> : null}
            </div>
            <div className="flex justify-center gap-2">
              <button type="button" disabled={saving} onClick={() => void saveAndNext()} className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}>{saving ? '…' : needsNext ? '重试' : '继续'}</button>
              {rating === 4 ? <button type="button" disabled={saving || needsNext} onClick={() => { setRating(0); void saveAndNext(0) }} className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}>忘记</button> : null}
            </div>
          </div> : null}
        </FadeSwap>
      )}
    </div>
  )
}

function ScopedLearnPage() {
  const groupId = useSearchParams().get('groupId') || null
  return <LearnPageContent key={groupId ?? 'all'} groupId={groupId} />
}

export default function LearnPage() {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><ScopedLearnPage /></Suspense>
}
