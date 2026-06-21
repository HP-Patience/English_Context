'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PronounceButton from '@/components/PronounceButton'
import Loading from '@/components/Loading'

type GroupInfo = {
  id: string
  name: string
}

type WordItem = {
  id: string
  text: string
  pos: string
  definitionCn: string
  mastery: number
  status: string
  bookmarked: boolean
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

export default function WordListPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = params.groupId as string

  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [words, setWords] = useState<WordItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return
    fetch(`/api/groups/${groupId}/words`)
      .then((r) => r.json())
      .then((data) => {
        setGroup(data.group)
        setWords(data.words ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [groupId])

  if (loading) {
    return (
      <div className="mx-auto max-w-lg">
        <Loading />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            {group?.name ?? '单词列表'}
          </h1>
          <span className="text-sm text-stone-400">{words.length} 词</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/learn?groupId=${groupId}`)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            开始学习
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            返回
          </button>
        </div>
      </div>

      {/* Word list */}
      {words.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-400">该分组暂无单词</p>
      ) : (
        <div className="space-y-2">
          {words.map((w) => (
            <Link
              key={w.id}
              href={`/word/${w.id}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
            >
              {/* Word text + TTS */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  {w.text}
                </span>
                <div onClick={(e) => e.stopPropagation()}>
                  <PronounceButton word={w.text} />
                </div>
              </div>

              {/* POS + Chinese definition */}
              <div className="hidden min-w-0 flex-1 sm:block">
                {w.pos && (
                  <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
                    {w.pos}
                  </span>
                )}
                {w.definitionCn && (
                  <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                    {w.definitionCn}
                  </p>
                )}
              </div>

              {/* Mastery badge */}
              <span
                className={`shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium dark:bg-stone-800 ${masteryColor(w.mastery)}`}
              >
                {masteryLabel(w.mastery)}
              </span>

              {/* Bookmark */}
              {w.bookmarked && (
                <span className="shrink-0 text-sm text-amber-500">★</span>
              )}

              {/* Chevron */}
              <svg
                className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
