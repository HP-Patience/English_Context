'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PronounceButton from '@/components/PronounceButton'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import SelectionSearch from '@/components/SelectionSearch'
import Loading from '@/components/Loading'
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
  sentenceCn: string | null
}
const ratings = [{ label: '清楚', grade: 4 }, { label: '模糊', grade: 2 }, { label: '忘记', grade: 0 }]

function LearnPageContent({ groupId }: { groupId: string | null }) {
  const requestUrl = groupId ? `/api/kaoyan/learn?groupId=${encodeURIComponent(groupId)}` : '/api/kaoyan/learn'
  const [item, setItem] = useState<LearnItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadNext = useCallback(() => fetch(requestUrl, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('load failed')
      const data = await response.json() as LearnItem | { done: true }
      if ('done' in data && data.done) {
        setDone(true)
        setItem(null)
      } else if ('meaningId' in data && data.meaningId && data.wordId) {
        setItem(data)
        setDone(false)
      } else throw new Error('invalid learning response')
    })
    .catch(() => setError('单词加载失败，请重试。'))
    .finally(() => setLoading(false)), [requestUrl])
  useEffect(() => { void loadNext() }, [loadNext])

  async function saveAndNext() {
    if (!item || rating === null || saving) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/kaoyan/learn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.id ? { userWordMeaningId: item.id, grade: rating } : { meaningId: item.meaningId, grade: rating }),
      })
      if (!response.ok) throw new Error('save failed')
      invalidateCache('/api/kaoyan/stats')
      invalidateCache('/api/review-queue')
      invalidateCache('/api/relearn')
      setItem(null)
      setRating(null)
      setLoading(true)
      await loadNext()
    } catch {
      setError('进度未能保存，请重试。当前单词不会被跳过。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="mx-auto max-w-lg"><Loading text="正在加载下一个未背单词…" /></div>
  if (done) return <div className="mx-auto max-w-lg py-8"><h1 className="text-xl font-semibold">暂时没有未背的单词</h1></div>

  return (
    <div className="mx-auto max-w-lg">
      {error ? <p role="alert" className="mb-5 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {!item ? <button type="button" onClick={() => { setError(null); setLoading(true); void loadNext() }} className="min-h-11 rounded-lg border border-stone-300 px-5 text-sm dark:border-stone-700">重试</button> : (
        <>
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold"><Link href={`/word/${encodeURIComponent(item.wordId)}`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500">{item.word}</Link></h1>
              <PronounceButton word={item.word} />
            </div>
            <WordBookmarkButton key={item.wordId} wordId={item.wordId} word={item.word} initialBookmarked={item.bookmarked} size="base" />
          </div>
          {item.sentence ? <SelectionSearch><div className="mb-6">
            <div className="mb-2 flex justify-end"><SentenceTTSButton text={item.sentence} /></div>
            <p className="text-lg leading-8">{highlightWord(item.sentence, item.word).map((part, index) => <span key={index} className={part.highlight ? 'font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 dark:text-amber-400' : undefined}>{part.text}</span>)}</p>
          </div></SelectionSearch> : null}
          <div className="grid grid-cols-3 gap-2">
            {ratings.map(({ label, grade }) => <button key={grade} type="button" disabled={saving} aria-pressed={rating === grade} onClick={() => setRating(grade)} className={`min-h-12 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:opacity-50 ${rating === grade ? 'border-stone-900 font-semibold dark:border-stone-100' : 'border-stone-200 text-stone-500 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400'}`}>{label}</button>)}
          </div>
          {rating !== null ? <div className="mt-6 space-y-4">
            <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
              <p className="mb-1 text-xs text-stone-500">{item.pos}</p>
              <SelectionSearch><p className="text-base leading-7">{item.definitionCn || item.definition}</p></SelectionSearch>
              {item.sentenceCn ? <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.sentenceCn}</p> : null}
            </div>
            <button type="button" disabled={saving} onClick={() => void saveAndNext()} className="min-h-12 w-full rounded-xl bg-stone-900 px-5 text-sm font-medium text-white hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">{saving ? '正在保存…' : '保存并继续'}</button>
          </div> : null}
        </>
      )}
    </div>
  )
}

function ScopedLearnPage() {
  const groupId = useSearchParams().get('groupId') || null
  return <LearnPageContent key={groupId ?? 'all'} groupId={groupId} />
}

export default function LearnPage() {
  return <Suspense fallback={<Loading text="正在加载下一个未背单词…" />}><ScopedLearnPage /></Suspense>
}
