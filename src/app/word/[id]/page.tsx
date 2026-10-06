'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Loading from '@/components/Loading'
import PronounceButton from '@/components/PronounceButton'
import { BookmarkStarIcon } from '@/components/BookmarkStarIcon'
import { invalidateCache } from '@/lib/api-cache'
import type { BookmarkStatePayload } from '@/lib/bookmark-api-types'

import { StoryReferences } from './StoryReferences'
import { WordLearningContent } from './WordLearningContent'
import type { UserWordInfo, WordDetail, WordDetailResponse } from './word-detail-types'

export default function WordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [word, setWord] = useState<WordDetail | null>(null)
  const [userWord, setUserWord] = useState<UserWordInfo | null>(null)
  const [storyReferences, setStoryReferences] = useState<WordDetailResponse['storyReferences']>([])
  const [error, setError] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [bookmarkError, setBookmarkError] = useState('')
  const [bookmarked, setBookmarked] = useState(false)
  const [savingBookmark, setSavingBookmark] = useState(false)
  const activeError = errorId === id ? error : ''
  const loading = loadedId !== id && activeError.length === 0

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    fetch(`/api/words/${id}`, { signal: controller.signal })
      .then(async (response): Promise<WordDetailResponse> => {
        if (!response.ok) throw new WordNotFoundError()
        return response.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setWord(data.word)
        setLoadedId(id)
        setErrorId(null)
        setStoryReferences(data.storyReferences)
        const currentUserWord = data.word.userWords[0]
        if (currentUserWord) {
          setUserWord(currentUserWord)
          setBookmarked(currentUserWord.bookmarked)
        }
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        if (!controller.signal.aborted) {
          setErrorId(id)
          setError(caught instanceof Error ? caught.message : '单词加载失败，请稍后重试。')
        }
      })
    return () => controller.abort()
  }, [id, retryToken])

  async function toggleBookmark(): Promise<void> {
    if (!word) return
    setSavingBookmark(true)
    setBookmarkError('')
    try {
      const payload: BookmarkStatePayload = { type: 'word', wordId: word.id, bookmarked: !bookmarked }
      const response = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        setBookmarkError('收藏状态保存失败，请稍后重试。')
        return
      }
      const data: { readonly bookmarked: boolean } = await response.json()
      invalidateCache('/api/bookmarks')
      setBookmarked(data.bookmarked)
    } catch (caught) {
      setBookmarkError(caught instanceof Error ? '网络连接失败，请稍后重试。' : '收藏状态保存失败，请稍后重试。')
    } finally {
      setSavingBookmark(false)
    }
  }

  if (loading) return <div className="mx-auto min-h-[28rem] max-w-lg"><Loading className="min-h-[28rem]" /></div>

  if (activeError || !word) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">{activeError || '单词未找到'}</p>
        <div className="mt-4 flex justify-center gap-3">
          {activeError ? <button type="button" onClick={() => { setErrorId(null); setRetryToken(token => token + 1) }} className="min-h-11 rounded-lg border border-stone-300 px-5 py-2 text-sm dark:border-stone-700">重试</button> : null}
          <button data-route-transition type="button" onClick={() => router.back()} className="min-h-11 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">返回</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="break-words font-serif text-3xl font-bold text-stone-900 dark:text-stone-100" lang="en">{word.text}</h1>
          <PronounceButton word={word.text} />
          <button
            type="button"
            onClick={toggleBookmark}
            disabled={savingBookmark}
            aria-pressed={bookmarked}
            aria-label={`${bookmarked ? '取消收藏' : '收藏'}单词 ${word.text}`}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-offset-stone-950 ${bookmarked ? 'word-bookmark-selected' : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300 hover:text-amber-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-amber-700 dark:hover:text-amber-300'}`}
          >
            <BookmarkStarIcon bookmarked={bookmarked} className="h-6 w-6" />
          </button>
        </div>
        {userWord ? <span className={`rounded-full bg-stone-100 px-3 py-1 text-xs font-medium dark:bg-stone-800 ${masteryColor(userWord.mastery)}`}>{masteryLabel(userWord.mastery)} {userWord.mastery > 0 ? `· ${userWord.mastery}%` : ''}</span> : null}
      </header>

      {bookmarkError ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{bookmarkError}</p> : null}

      {word.groups.length > 0 ? (
        <div aria-label="所属词组" className="mb-6 flex flex-wrap gap-2">
          {word.groups.map((group) => <span key={group.wordGroup.id} className="rounded-full bg-stone-100 px-3 py-2 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">{group.wordGroup.name}</span>)}
        </div>
      ) : null}

      <WordLearningContent word={word} />
      <StoryReferences references={storyReferences} />

      <div className="mt-8 flex gap-3">
        {userWord && userWord.mastery > 0 ? <Link href="/review" className="min-h-12 flex-1 rounded-xl bg-stone-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">去复习</Link> : null}
        <button data-route-transition type="button" onClick={() => router.back()} className="min-h-12 rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">返回</button>
      </div>
    </div>
  )
}

function masteryLabel(mastery: number): string {
  if (mastery >= 75) return '已掌握'
  if (mastery >= 25) return '学习中'
  if (mastery > 0) return '初学'
  return '未学'
}

function masteryColor(mastery: number): string {
  if (mastery >= 75) return 'text-green-600 dark:text-green-400'
  if (mastery >= 25) return 'text-amber-700 dark:text-amber-400'
  return 'text-stone-500 dark:text-stone-400'
}

class WordNotFoundError extends Error {
  readonly name = 'WordNotFoundError'

  constructor() {
    super('未找到单词')
  }
}
