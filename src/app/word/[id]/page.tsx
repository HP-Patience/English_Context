'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PronounceButton from '@/components/PronounceButton'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import { highlightWord } from '@/lib/highlight'
import Loading from '@/components/Loading'

type WordDetail = {
  id: string
  text: string
  meanings: Array<{
    id: string
    partOfSpeech: string
    definition: string
    definitionCn: string | null
    userWordMeanings: Array<{
      id: string
      mastery: number
      easeFactor: number
      interval: number
      nextReviewAt: string
      sentences: Array<{
        sentenceText: string
        sentenceCn: string | null
        contextTopic: string | null
      }>
    }>
  }>
  groups: Array<{
    wordGroup: { id: string; name: string }
  }>
}

type UserWordInfo = {
  id: string
  mastery: number
  status: string
  bookmarked: boolean
}

export default function WordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [word, setWord] = useState<WordDetail | null>(null)
  const [userWord, setUserWord] = useState<UserWordInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bookmarked, setBookmarked] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/words/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('未找到单词')
        return r.json()
      })
      .then((data) => {
        setWord(data.word)
        const uw = data.word.userWords?.[0]
        if (uw) {
          setUserWord(uw)
          setBookmarked(uw.bookmarked ?? false)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function toggleBookmark() {
    if (!word) return
    try {
      const res = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId: word.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.bookmarked !== undefined) setBookmarked(data.bookmarked)
      }
    } catch {}
  }

  function masteryLabel(m: number): string {
    if (m >= 75) return '已掌握'
    if (m >= 25) return '学习中'
    if (m > 0) return '初学'
    return '未学'
  }

  function masteryColor(m: number): string {
    if (m >= 75) return 'text-green-600 dark:text-green-400'
    if (m >= 25) return 'text-amber-600 dark:text-amber-400'
    return 'text-stone-400 dark:text-stone-500'
  }

  if (loading) {
    return <div className="mx-auto max-w-lg"><Loading /></div>
  }

  if (error || !word) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm text-stone-400 dark:text-stone-500">{error || '单词未找到'}</p>
        <button onClick={() => router.back()} className="mt-4 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">返回</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Word header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100">{word.text}</h1>
          <PronounceButton word={word.text} />
          <button
            onClick={toggleBookmark}
            className={`text-xl ${bookmarked ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400 dark:text-stone-600 dark:hover:text-amber-400'}`}
            title={bookmarked ? '取消收藏' : '收藏'}
          >
            {bookmarked ? '★' : '☆'}
          </button>
        </div>
        {userWord && (
          <span className={`rounded-full bg-stone-100 px-3 py-1 text-xs font-medium dark:bg-stone-800 ${masteryColor(userWord.mastery)}`}>
            {masteryLabel(userWord.mastery)} {userWord.mastery > 0 && `· ${userWord.mastery}%`}
          </span>
        )}
      </div>

      {/* Groups */}
      {word.groups.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {word.groups.map((g) => (
            <button
              key={g.wordGroup.id}
              onClick={() => router.push(`/learn?groupId=${g.wordGroup.id}`)}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              {g.wordGroup.name}
            </button>
          ))}
        </div>
      )}

      {/* Meanings */}
      <div className="mb-6 space-y-4">
        <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">释义</h2>
        {word.meanings.map((m) => {
          const uwm = m.userWordMeanings[0]
          return (
            <div
              key={m.id}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <div className="mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  {m.partOfSpeech}
                </span>
                {uwm && (
                  <span className="ml-2 text-xs text-stone-400 dark:text-stone-500">
                    掌握 {uwm.mastery}% · 间隔 {uwm.interval}天
                  </span>
                )}
              </div>
              <p className="text-base font-medium text-stone-900 dark:text-stone-100">{m.definition}</p>
              {m.definitionCn && m.definitionCn !== m.definition && (
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{m.definitionCn}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Sentences */}
      {word.meanings.some((m) => m.userWordMeanings[0]?.sentences?.length > 0) && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">例句与译文</h2>
          {word.meanings.map((m) => {
            const sentences = m.userWordMeanings[0]?.sentences ?? []
            if (sentences.length === 0) return null
            return (
              <div key={m.id} className="space-y-2">
                {sentences.map((s, i) => (
                  <div key={i}>
                    <div className="mb-1 flex justify-end">
                      <SentenceTTSButton text={s.sentenceText} />
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
                    >
                      <p className="text-sm leading-relaxed text-stone-800 dark:text-stone-200">
                        {highlightWord(s.sentenceText, word.text).map((part, j) =>
                          part.highlight ? (
                            <span key={j} className="font-semibold text-amber-600 underline decoration-amber-300 decoration-2 underline-offset-4">{part.text}</span>
                          ) : (
                            <span key={j}>{part.text}</span>
                          )
                        )}
                      </p>
                      {s.sentenceCn && (
                        <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                          {s.sentenceCn}
                        </p>
                      )}
                    {s.contextTopic && (
                      <span className="mt-1.5 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                        {s.contextTopic}
                      </span>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-8 flex gap-3">
        {userWord && userWord.mastery > 0 ? (
          <button
            onClick={() => router.push('/review')}
            className="flex-1 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            去复习
          </button>
        ) : word.groups.length > 0 ? (
          <button
            onClick={() => router.push(`/learn?groupId=${word.groups[0].wordGroup.id}`)}
            className="flex-1 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            从 {word.groups[0].wordGroup.name} 学习
          </button>
        ) : null}
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          返回
        </button>
      </div>
    </div>
  )
}
