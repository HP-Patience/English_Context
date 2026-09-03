'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import Loading from '@/components/Loading'
import SelectionSearch from '@/components/SelectionSearch'
import { cachedFetch, invalidateCache } from '@/lib/api-cache'
import type { BookmarkStatePayload } from '@/lib/bookmark-api-types'

type WordMeaning = {
  readonly id: string
  readonly partOfSpeech: string
  readonly definition: string
  readonly definitionCn: string | null
  readonly userWordMeanings: readonly {
    readonly mastery: number
    readonly sentences: readonly { readonly sentenceText: string }[]
  }[]
}

type WordBookmark = {
  readonly type: 'word'
  readonly id: string
  readonly userId: string
  readonly wordId: string
  readonly status: string
  readonly mastery: number
  readonly bookmarked: boolean
  readonly learnRound: number
  readonly lastRatedAt: string | null
  readonly createdAt: string
  readonly word: {
    readonly id: string
    readonly text: string
    readonly meanings: readonly WordMeaning[]
  }
}

type StoryCardBookmark = {
  readonly type: 'storyCard'
  readonly id: string
  readonly lessonId: string
  readonly lessonOrder: number
  readonly lessonTitle: string
  readonly paragraphIndex: number
  readonly sceneTitle: string
  readonly createdAt: string
}

type BookmarkItem = WordBookmark | StoryCardBookmark

type BookmarkCardProps = {
  readonly item: BookmarkItem
  readonly saving: boolean
  readonly onUnbookmark: (item: BookmarkItem) => Promise<void>
}

const actionClassName = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:focus-visible:ring-offset-stone-950'

function BookmarkCard({ item, saving, onUnbookmark }: BookmarkCardProps) {
  switch (item.type) {
    case 'word':
      return (
        <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">单词</p>
              <Link href={`/word/${item.word.id}`} className="mt-1 inline-block font-serif text-xl font-bold text-stone-900 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-stone-100 dark:hover:text-amber-400" lang="en">
                {item.word.text}
              </Link>
            </div>
            <button type="button" disabled={saving} onClick={() => onUnbookmark(item)} className={actionClassName} aria-label={`取消收藏单词 ${item.word.text}`} aria-pressed="true">
              {saving ? '取消中' : '取消收藏'}
            </button>
          </div>
          <div className="mt-3 space-y-1">
            {item.word.meanings.map((meaning) => (
              <div key={meaning.id} className="text-sm leading-6">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{meaning.partOfSpeech}</span>{' '}
                <SelectionSearch><span className="text-stone-700 dark:text-stone-300">{meaning.definition}</span></SelectionSearch>
                {meaning.definitionCn && meaning.definitionCn !== meaning.definition ? <span className="ml-1 text-stone-500 dark:text-stone-400">· {meaning.definitionCn}</span> : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
            <Link href={`/learn?wordId=${item.word.id}`} className={actionClassName}>学习</Link>
            <Link href="/review" className={actionClassName}>复习</Link>
          </div>
        </article>
      )
    case 'storyCard':
      return (
        <article className="story-theme rounded-2xl border p-4 shadow-sm dark:shadow-none sm:p-5" style={{ backgroundColor: 'var(--story-surface)', borderColor: 'var(--story-line)', color: 'var(--story-ink)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-800 dark:text-red-400">故事段落 · 第 {item.lessonOrder} 篇</p>
              <Link href={`/story/${item.lessonId}/cards/${item.paragraphIndex}`} className="mt-2 inline-block font-serif text-xl font-semibold text-stone-950 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:text-stone-50 dark:hover:text-red-400">
                {item.sceneTitle}
              </Link>
              <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">{item.lessonTitle}</p>
            </div>
            <button type="button" disabled={saving} onClick={() => onUnbookmark(item)} className={actionClassName} aria-label={`取消收藏故事段落 ${item.sceneTitle}`} aria-pressed="true">
              {saving ? '取消中' : '取消收藏'}
            </button>
          </div>
        </article>
      )
    default:
      return assertNever(item)
  }
}

export default function BookmarksPage() {
  const [items, setItems] = useState<readonly BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    cachedFetch<{ readonly bookmarks: readonly BookmarkItem[] }>('/api/bookmarks')
      .then((data) => setItems(data.bookmarks))
      .catch(() => setError('收藏内容加载失败，请稍后重试。'))
      .finally(() => setLoading(false))
  }, [])

  async function handleUnbookmark(item: BookmarkItem): Promise<void> {
    const itemKey = `${item.type}:${item.id}`
    setSavingIds((current) => new Set(current).add(itemKey))
    setError('')
    const payload = toBookmarkStatePayload(item)
    try {
      const response = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        setError('取消收藏失败，请稍后重试。')
        return
      }
      invalidateCache('/api/bookmarks')
      setItems((current) => current.filter((bookmark) => bookmark.id !== item.id))
    } catch (caught) {
      setError(caught instanceof Error ? '网络连接失败，请稍后重试。' : '取消收藏失败，请稍后重试。')
    } finally {
      setSavingIds((current) => {
        const next = new Set(current)
        next.delete(itemKey)
        return next
      })
    }
  }

  if (loading) return <Loading />

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">收藏</h1>
      {error ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}
      {items.length === 0 ? <div className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">还没有收藏内容，可在单词详情或故事段落中添加收藏。</div> : null}
      <div className="space-y-3">
        {items.map((item) => <BookmarkCard key={`${item.type}-${item.id}`} item={item} saving={savingIds.has(`${item.type}:${item.id}`)} onUnbookmark={handleUnbookmark} />)}
      </div>
    </div>
  )
}

function toBookmarkStatePayload(item: BookmarkItem): BookmarkStatePayload {
  switch (item.type) {
    case 'word':
      return { type: 'word', wordId: item.word.id, bookmarked: false }
    case 'storyCard':
      return { type: 'storyCard', lessonId: item.lessonId, paragraphIndex: item.paragraphIndex, bookmarked: false }
    default:
      return assertNever(item)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported bookmark type: ${JSON.stringify(value)}`)
}
