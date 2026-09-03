'use client'

import { useState } from 'react'

import { invalidateCache } from '@/lib/api-cache'
import type { BookmarkStatePayload } from '@/lib/bookmark-api-types'

type StoryCardBookmarkButtonProps = {
  readonly lessonId: string
  readonly paragraphIndex: number
  readonly bookmarked: boolean
  readonly onBookmarkedChange: (bookmarked: boolean) => void
}

const outlinedStarPath = 'm908.1 353.1l-253.9-36.9L540.7 86.1c-3.1-6.3-8.2-11.4-14.5-14.5c-15.8-7.8-35-1.3-42.9 14.5L369.8 316.2l-253.9 36.9c-7 1-13.4 4.3-18.3 9.3a32.05 32.05 0 0 0 .6 45.3l183.7 179.1l-43.4 252.9a31.95 31.95 0 0 0 46.4 33.7L512 754l227.1 119.4c6.2 3.3 13.4 4.4 20.3 3.2c17.4-3 29.1-19.5 26.1-36.9l-43.4-252.9l183.7-179.1c5-4.9 8.3-11.3 9.3-18.3c2.7-17.5-9.5-33.7-27-36.3M664.8 561.6l36.1 210.3L512 672.7L323.1 772l36.1-210.3l-152.8-149L417.6 382L512 190.7L606.4 382l211.2 30.7z'
const filledStarPath = 'm908.1 353.1l-253.9-36.9L540.7 86.1c-3.1-6.3-8.2-11.4-14.5-14.5c-15.8-7.8-35-1.3-42.9 14.5L369.8 316.2l-253.9 36.9c-7 1-13.4 4.3-18.3 9.3a32.05 32.05 0 0 0 .6 45.3l183.7 179.1l-43.4 252.9a31.95 31.95 0 0 0 46.4 33.7L512 754l227.1 119.4c6.2 3.3 13.4 4.4 20.3 3.2c17.4-3 29.1-19.5 26.1-36.9l-43.4-252.9l183.7-179.1c5-4.9 8.3-11.3 9.3-18.3c2.7-17.5-9.5-33.7-27-36.3'

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
            ? 'border-[var(--story-accent-line)] bg-[var(--story-accent-soft)] text-[var(--story-accent)]'
            : 'border-[var(--story-line)] bg-[var(--story-surface)] text-[var(--story-muted)] hover:border-[var(--story-accent-line)] hover:text-[var(--story-ink)]'
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 1024 1024" className="h-5 w-5">
          <path d={bookmarked ? filledStarPath : outlinedStarPath} fill="currentColor" />
        </svg>
      </button>
      {failed ? (
        <p role="alert" className="absolute left-0 top-full z-10 mt-1 w-max max-w-52 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900 shadow-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          收藏失败，请重试。
        </p>
      ) : null}
    </div>
  )
}
