'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-cache'

type SearchResult = {
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
      sentences: Array<{
        sentenceText: string
        sentenceCn: string | null
      }>
    }>
  }>
  userWords: Array<{
    id: string
    mastery: number
  }>
  groups: Array<{
    wordGroup: {
      id: string
      name: string
    }
  }>
}

function SearchPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const data = await cachedFetch<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      )
      setResults(data.results)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialQ) doSearch(initialQ)
  }, [initialQ, doSearch])

  // Debounced auto-search on input change (don't update URL until submit)
  useEffect(() => {
    if (!query.trim() || query === initialQ) return
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch, initialQ])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(query)}`)
    doSearch(query)
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

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={handleSubmit} className="mb-6">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词或中文释义..."
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500"
        />
      </form>

      {loading && <p className="text-center text-sm text-stone-400 dark:text-stone-500">搜索中...</p>}

      {!loading && searched && results.length === 0 && (
        <p className="text-center text-sm text-stone-400 dark:text-stone-500">未找到匹配结果</p>
      )}

      <div className="space-y-3">
        {results.map((word) => {
          const userWord = word.userWords[0]
          const learned = userWord && userWord.mastery > 0
          return (
            <div
              key={word.id}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:shadow-none dark:border-stone-700 dark:bg-stone-900"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <Link
                  href={`/word/${word.id}`}
                  className="text-lg font-bold text-stone-900 hover:text-amber-600 dark:text-stone-100 dark:hover:text-amber-400"
                >
                  {word.text}
                </Link>
                {userWord && (
                  <span className={`text-xs font-medium ${masteryColor(userWord.mastery)}`}>
                    {masteryLabel(userWord.mastery)}
                  </span>
                )}
              </div>

              {word.meanings.map((m) => {
                const uwm = m.userWordMeanings[0]
                const sentence = uwm?.sentences[0]
                return (
                  <div key={m.id} className="mb-2 last:mb-0">
                    <p className="text-sm text-stone-700 dark:text-stone-300">
                      <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                        {m.partOfSpeech}
                      </span>{' '}
                      {m.definition}
                      {m.definitionCn && (
                        <span className="ml-1 text-stone-500 dark:text-stone-400">· {m.definitionCn}</span>
                      )}
                    </p>
                    {sentence && (
                      <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500 italic">
                        {sentence.sentenceText}
                      </p>
                    )}
                  </div>
                )
              })}

              <div className="mt-2 flex gap-2">
                {learned ? (
                  <button
                    onClick={() => router.push('/review')}
                    className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  >
                    去复习
                  </button>
                ) : word.groups && word.groups.length > 0 ? (
                  <button
                    onClick={() => router.push(`/learn?groupId=${word.groups[0].wordGroup.id}`)}
                    className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  >
                    从 {word.groups[0].wordGroup.name} 学习
                  </button>
                ) : (
                  <span className="rounded-lg bg-stone-50 px-3 py-1 text-xs text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                    未学
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>}>
      <SearchPageContent />
    </Suspense>
  )
}
