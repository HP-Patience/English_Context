'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FadeSwap } from '@/components/FadeSwap'
import PronounceButton from '@/components/PronounceButton'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import { MemoryRatingButtons, memoryRatingButtonClass } from '@/components/MemoryRatingButtons'
import SelectionSearch from '@/components/SelectionSearch'
import { highlightedWordClass, highlightWord } from '@/lib/highlight'
import { cachedFetch, invalidateCache } from '@/lib/api-cache'
import AnalysisPanel from '@/components/AnalysisPanel'
import { WordBookmarkButton } from '@/components/WordBookmarkButton'

type TabType = 'review' | 'relearn' | 'analysis'

const TAB_LABELS: Record<TabType, string> = {
  review: '复习',
  relearn: '重新学习',
  analysis: '错词分析',
}

function TabBar({ tab, onTabChange }: { tab: TabType; onTabChange: (t: TabType) => void }) {
  return (
    <div className="mb-6 flex gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
      {(Object.entries(TAB_LABELS) as [TabType, string][]).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onTabChange(key)}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === key ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100' : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

type ReviewItem = {
  id: string
  mastery: number
  wordMastery: number
  meaning: { id: string; partOfSpeech: string; definition: string; definitionCn: string | null }
  userWord: { word: { text: string; id: string }; bookmarked: boolean; wordId: string }
  sentences: Array<{ sentenceText: string; sentenceCn: string | null; contextTopic: string | null }>
}

export default function ReviewPage() {
  const [tab, setTab] = useState<TabType>('review')
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [idx, setIdx] = useState(0)
  const [selfRate, setSelfRate] = useState<'clear' | 'vague' | 'forgot' | null>(null)
  const [showDef, setShowDef] = useState(false)
  const [showForgotAfterClear, setShowForgotAfterClear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [relearnQueue, setRelearnQueue] = useState<ReviewItem[]>([])
  const [relearnIdx, setRelearnIdx] = useState(0)
  const [relearnStarted, setRelearnStarted] = useState(false)
  const [relearnLoading, setRelearnLoading] = useState(false)
  const [relearnDone, setRelearnDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    cachedFetch<ReviewItem[]>('/api/review-queue')
      .then((data) => {
        setQueue(data)
        setLoading(false)
        if (data.length === 0) setDone(true)
      })
      .catch(() => { setError('复习内容加载失败，请重试。'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (tab !== 'relearn') return
    cachedFetch<ReviewItem[]>('/api/relearn')
      .then((data) => {
        setRelearnQueue(data)
        setRelearnLoading(false)
      })
      .catch(() => { setError('重新学习内容加载失败，请重试。'); setRelearnLoading(false) })
  }, [tab])

  const item = queue[idx]

  function getSentence(): { text: string; cn: string | null } {
    if (!item) return { text: '', cn: null }
    const sorted = [...item.sentences].sort((a) => (a.contextTopic === 'interest_tuned' ? -1 : 1))
    return { text: sorted[0]?.sentenceText ?? '', cn: sorted[0]?.sentenceCn ?? null }
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

  async function handleNext() {
    if (!item || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWordMeaningId: item.id,
          grade: gradeFromRate(selfRate!),
          sentenceText: getSentence().text,
          flippedToForgot: selfRate === 'forgot',
        }),
      })
      if (!response.ok) throw new Error('save failed')
      invalidateCache('/api/kaoyan/stats')
      invalidateCache('/api/daily-goal')
      invalidateCache('/api/stats')
      invalidateCache('/api/review/analysis')
    } catch {
      setError('进度未能保存，请重试。当前单词不会被跳过。')
      setSubmitting(false)
      return
    }
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

  function getRelearnSentence(): { text: string; cn: string | null } {
    const rItem = relearnQueue[relearnIdx]
    if (!rItem) return { text: '', cn: null }
    const sorted = [...rItem.sentences].sort((a) => (a.contextTopic === 'interest_tuned' ? -1 : 1))
    return { text: sorted[0]?.sentenceText ?? '', cn: sorted[0]?.sentenceCn ?? null }
  }

  async function handleRelearnNext() {
    const rItem = relearnQueue[relearnIdx]
    if (!rItem || !selfRate || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/kaoyan/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWordMeaningId: rItem.id,
          grade: gradeFromRate(selfRate),
        }),
      })
      if (!response.ok) throw new Error('save failed')
    } catch {
      setError('进度未能保存，请重试。当前单词不会被跳过。')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    if (relearnIdx < relearnQueue.length - 1) {
      setRelearnIdx((i) => i + 1)
      setSelfRate(null)
      setShowDef(false)
      setShowForgotAfterClear(false)
    } else {
      setRelearnStarted(false)
      setRelearnDone(true)
    }
  }

  function renderContent() {
  if (loading) return (
    <div className="mx-auto max-w-lg">
      <div className="min-h-[28rem]" data-page-loading="" aria-busy="true" />
    </div>
  )

  if (done) {
    return (
      <div className="mx-auto max-w-lg text-center">
          <p className="mb-1 text-5xl font-light text-stone-300 dark:text-stone-600">✓</p>
        <h2 className="mb-1 text-xl font-semibold">复习完成</h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">完成了 {idx} 个单词</p>
        <div className="flex justify-center gap-3">
          <Link href="/" className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">学新词</Link>
        </div>
      </div>
    )
  }

  if (!item && queue.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center">
          <h2 className="mb-1 text-xl font-semibold">暂无复习</h2>
        <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">学些新词再来</p>
        <Link href="/" className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">学新词</Link>
      </div>
    )
  }

  if (tab === 'relearn') {
    if (relearnLoading) {
      return (
        <div className="mx-auto max-w-lg">
              <div className="min-h-[28rem]" data-page-loading="" aria-busy="true" />
        </div>
      )
    }

    if (relearnDone) {
      return (
        <div className="mx-auto max-w-lg text-center">
              <p className="mb-1 text-5xl font-light text-stone-300 dark:text-stone-600">✓</p>
          <h2 className="mb-1 text-xl font-semibold">重新学习完成</h2>
          <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">完成了 {relearnQueue.length} 个单词</p>
          <button onClick={() => { setRelearnDone(false); setRelearnStarted(false); setTab('review') }} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">返回复习</button>
        </div>
      )
    }

    if (!relearnStarted) {
      if (relearnQueue.length === 0) {
        return (
          <div className="mx-auto max-w-lg text-center">
                  <h2 className="mb-1 text-xl font-semibold">暂无需要重新学习的单词</h2>
            <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">继续保持！</p>
          </div>
        )
      }

      return (
        <div className="mx-auto max-w-lg text-center">
              <h2 className="mb-1 text-xl font-semibold">{relearnQueue.length} 个需要重新学习</h2>
          <p className="mb-8 text-sm text-stone-400 dark:text-stone-500">掌握度低于 60% 的单词</p>
          <button
            onClick={() => {
              setRelearnStarted(true)
              setRelearnIdx(0)
              setSelfRate(null)
              setShowDef(false)
              setShowForgotAfterClear(false)
            }}
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            开始学习
          </button>
        </div>
      )
    }

    // Relearn in progress
    const relearnItem = relearnQueue[relearnIdx]
    if (!relearnItem) {
      return (
        <div className="mx-auto max-w-lg text-center">
              <p className="text-sm text-stone-400 dark:text-stone-500">暂无内容</p>
        </div>
      )
    }

    const rsentence = getRelearnSentence()
    const rword = relearnItem.userWord.word.text
    const rparts = rsentence.text ? highlightWord(rsentence.text, rword) : []

    return (
      <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center gap-3">
          <div className="h-1 flex-1 rounded-full bg-stone-200 dark:bg-stone-800">
            <div className="h-1 rounded-full bg-stone-900 transition-all dark:bg-stone-100" style={{ width: `${((relearnIdx + 1) / relearnQueue.length) * 100}%` }} />
          </div>
          <span className="text-xs text-stone-400 dark:text-stone-500">{relearnIdx + 1}/{relearnQueue.length}</span>
        </div>

        <FadeSwap transitionKey={relearnItem.id}>
        <div className="mb-6">
          {rsentence.text && <SelectionSearch><p className="text-lg leading-relaxed text-stone-800 dark:text-stone-200">
            {rparts.map((part, i) =>
              part.highlight ? (
                <Link key={i} href={`/word/${encodeURIComponent(relearnItem.userWord.word.id)}`} className={`${highlightedWordClass} rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600`}>{part.text}</Link>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </p></SelectionSearch>}
        </div>

        {!showDef ? (
          <MemoryRatingButtons value={selfRate === null ? null : gradeFromRate(selfRate)} disabled={submitting} onChange={(grade) => handleRate(grade === 4 ? 'clear' : grade === 2 ? 'vague' : 'forgot')} />
        ) : (
          <div className="learn-definition-reveal space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{relearnItem.userWord.word.text}</h2>
                <PronounceButton word={relearnItem.userWord.word.text} />
              </div>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">掌握 {relearnItem.mastery}%</span>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">{relearnItem.meaning.partOfSpeech}</span>
                <span className="text-xs text-stone-400 dark:text-stone-500">{relearnItem.mastery}%</span>
              </div>
              <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{relearnItem.meaning.definition}</p>
              {relearnItem.meaning.definitionCn && relearnItem.meaning.definitionCn !== relearnItem.meaning.definition && (
                <p className="mt-2 border-t border-stone-100 pt-2 text-sm font-medium text-stone-900 dark:border-stone-800 dark:text-stone-100">{relearnItem.meaning.definitionCn}</p>
              )}
            </div>

            {rsentence.cn && (
              <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
                <span className="mb-1.5 block text-xs font-medium text-stone-400 dark:text-stone-500">译文</span>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{rsentence.cn}</p>
              </div>
            )}

            <div className="flex justify-center gap-2">

            <button onClick={handleRelearnNext} disabled={submitting} className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}>
              {submitting ? '...' : '继续'}
            </button>
{showForgotAfterClear && (
              <button
                onClick={() => { setSelfRate('forgot'); setShowForgotAfterClear(false) }}
                className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}
              >
                忘记
              </button>
            )}


            </div>
          </div>
        )}
        </FadeSwap>
      </div>
    )
  }

  if (tab === 'analysis') {
    return (
      <div className="mx-auto max-w-lg">
          <AnalysisPanel />
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

      <FadeSwap transitionKey={item.id}>
      {/* sentence */}
      <div className="mb-6">
        {sentence.text && (
          <SelectionSearch>
            <div className="flex items-start gap-2">
              <span className="inline-flex h-8 shrink-0 items-center"><SentenceTTSButton text={sentence.text} /></span>
              <p className="min-w-0 flex-1 break-words text-lg leading-8 text-stone-800 dark:text-stone-200">
                {parts.map((part, i) =>
                  part.highlight ? (
                    <Link key={i} href={`/word/${encodeURIComponent(item.userWord.word.id)}`} className={`${highlightedWordClass} rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600`}>
                      {part.text}
                    </Link>
                  ) : (
                    <span key={i}>{part.text}</span>
                  )
                )}
              </p>
            </div>
          </SelectionSearch>
        )}
      </div>

      {/* self-assessment */}
      {!showDef ? (
        <MemoryRatingButtons value={selfRate === null ? null : gradeFromRate(selfRate)} disabled={submitting} onChange={(grade) => handleRate(grade === 4 ? 'clear' : grade === 2 ? 'vague' : 'forgot')} />
      ) : (
        /* definition panel */
        <div className="learn-definition-reveal space-y-4">
          {/* Word header with mastery */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{item.userWord.word.text}</h2>
              <PronounceButton word={item.userWord.word.text} />
              <WordBookmarkButton
                key={item.userWord.word.id}
                wordId={item.userWord.word.id}
                initialBookmarked={item.userWord.bookmarked}
                size="base"
              />
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
            {item.meaning.definitionCn && item.meaning.definitionCn !== item.meaning.definition && (
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

          <div className="flex justify-center gap-2">

          <button
            onClick={handleNext}
            disabled={submitting}
            className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}
          >
            {submitting ? '...' : idx < queue.length - 1 ? '继续' : '完成'}
          </button>
{showForgotAfterClear && (
            <button
              onClick={handleForgotAfterClear}
              className={`${memoryRatingButtonClass()} w-[calc((100%_-_1rem)/3)]`}
            >
              忘记
            </button>
          )}


          </div>
        </div>
      )}
      </FadeSwap>
    </div>
  )
  }
  return <div className="mx-auto max-w-lg">
    <TabBar tab={tab} onTabChange={next => { setTab(next); setError(null); if (next === 'relearn') setRelearnLoading(true) }} />
    {error ? <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    <FadeSwap transitionKey={tab}>{renderContent()}</FadeSwap>
  </div>
}
