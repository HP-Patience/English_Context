'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-cache'

type BookmarkItem = {
  id: string
  word: {
    id: string
    text: string
    meanings: Array<{
      id: string
      partOfSpeech: string
      definition: string
      definitionCn: string | null
      userWordMeanings: Array<{
        mastery: number
        sentences: Array<{ sentenceText: string }>
      }>
    }>
  }
}

export default function BookmarksPage() {
  const router = useRouter()
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cachedFetch<{ bookmarks: BookmarkItem[] }>('/api/bookmarks')
      .then((d) => setItems(d.bookmarks))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleUnbookmark(wordId: string) {
    await fetch('/api/bookmarks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId }),
    })
    setItems((prev) => prev.filter((i) => i.word.id !== wordId))
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-100">难词本</h1>

      {items.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          还没有收藏的单词，在学习页面点击⭐即可收藏
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <Link
                href={`/word/${item.word.id}`}
                className="text-lg font-bold text-stone-900 hover:text-amber-600 dark:text-stone-100 dark:hover:text-amber-400"
              >
                {item.word.text}
              </Link>
              <button
                onClick={() => handleUnbookmark(item.word.id)}
                className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-500 dark:hover:bg-stone-800"
                title="取消收藏"
              >
                ☆
              </button>
            </div>

            {item.word.meanings.map((m) => (
              <div key={m.id} className="mb-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  {m.partOfSpeech}
                </span>{' '}
                <span className="text-stone-700 dark:text-stone-300">{m.definition}</span>
                {m.definitionCn && (
                  <span className="ml-1 text-stone-500 dark:text-stone-400">· {m.definitionCn}</span>
                )}
              </div>
            ))}

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => router.push(`/learn?wordId=${item.word.id}`)}
                className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                学习
              </button>
              <button
                onClick={() => router.push('/review')}
                className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                复习
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
