'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-cache'
import { highlightWord } from '@/lib/highlight'

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
  const [showAdd, setShowAdd] = useState(false)
  const [addWord, setAddWord] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState('')
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

  async function handleAddWord() {
    if (!addWord.trim()) return
    setAdding(true)
    setAddMsg('')
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: addWord.trim(), interests: [] }),
      })
      if (res.status === 409) {
        setAddMsg('这个词已经添加过了')
      } else if (res.ok) {
        setAddMsg(`✓ 已添加 "${addWord.trim()}"`)
        setAddWord('')
        setTimeout(() => setAddMsg(''), 3000)
      } else {
        setAddMsg('添加失败，请重试')
      }
    } catch {
      setAddMsg('网络错误')
    } finally {
      setAdding(false)
    }
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

      {/* Add word toggle */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-4 py-2.5 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700 dark:border-stone-600 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:text-stone-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 4v16M4 12h16" />
          </svg>
          添加单词
        </button>

        {showAdd && (
          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={addWord}
                onChange={(e) => setAddWord(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWord()}
                placeholder="输入英文单词..."
                className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              />
              <button
                onClick={handleAddWord}
                disabled={adding || !addWord.trim()}
                className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                {adding ? '...' : '添加'}
              </button>
            </div>
            {addMsg && (
              <p className={`mt-2 text-xs ${addMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>
                {addMsg}
              </p>
            )}
          </div>
        )}
      </div>

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
                      {m.definitionCn && m.definitionCn !== m.definition && (
                        <span className="ml-1 text-stone-500 dark:text-stone-400">· {m.definitionCn}</span>
                      )}
                    </p>
                    {sentence && (() => {
                      const parts = highlightWord(sentence.sentenceText, word.text)
                      return (
                        <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500 italic">
                          {parts.map((part, j) =>
                            part.highlight ? (
                              <span key={j} className="font-semibold text-amber-600 underline decoration-amber-300 decoration-2 underline-offset-4">{part.text}</span>
                            ) : (
                              <span key={j}>{part.text}</span>
                            )
                          )}
                        </p>
                      )
                    })()}
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
