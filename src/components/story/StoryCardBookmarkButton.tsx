'use client'

import { useState } from 'react'

import { BookmarkStarIcon } from '@/components/BookmarkStarIcon'
import { invalidateCache } from '@/lib/api-cache'
import type { BookmarkStatePayload } from '@/lib/bookmark-api-types'

type StoryCardBookmarkButtonProps = {
  readonly lessonId: string
  readonly paragraphIndex: number
  readonly bookmarked: boolean
  readonly onBookmarkedChange: (bookmarked: boolean) => void
}

function parseBookmarked(value: unknown): boolean | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (!('type' in value) || value.type !== 'storyCard') return null
  if (!('bookmarked' in value) || typeof value.bookmarked !== 'boolean') return null
  return value.bookmarked
}

export function StoryCardBookmarkButton({
  lessonId,
  paragraphIndex,
  bookmarked,
  onBookmarkedChange,
}: StoryCardBookmarkButtonProps) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const label = `${bookmarked ? '取消收藏' : '收藏'}第 ${paragraphIndex + 1} 段`

  async function setBookmark(): Promise<void> {
    if (saving) return
    setSaving(true)
    setFailed(false)
    try {
      const payload: BookmarkStatePayload = {
        type: 'storyCard',
        lessonId,
        paragraphIndex,
        bookmarked: !bookmarked,
      }
      const response = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const confirmed = response.ok ? parseBookmarked(await response.json()) : null
      if (confirmed === null) {
        setFailed(true)
        return
      }
      invalidateCache('/api/bookmarks')
      onBookmarkedChange(confirmed)
    } catch (error) {
      if (!(error instanceof TypeError || error instanceof SyntaxError)) throw error
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={saving}
        aria-pressed={bookmarked}
        aria-busy={saving}
        aria-label={label}
        title={label}
        onClick={() => void setBookmark()}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] disabled:cursor-wait disabled:opacity-60 ${
          bookmarked
            ? 'word-bookmark-selected'
            : 'border-[var(--story-line)] bg-[var(--story-surface)] text-[var(--story-muted)] hover:border-[var(--story-accent-line)] hover:text-[var(--story-ink)]'
        }`}
      >
        <BookmarkStarIcon bookmarked={bookmarked} />
      </button>
      {failed ? (
        <p role="alert" className="absolute left-0 top-full z-10 mt-1 w-max max-w-52 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900 shadow-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          收藏失败，请重试。
        </p>
      ) : null}
    </div>
  )
}
