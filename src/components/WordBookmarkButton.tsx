'use client'

import { useRef, useState } from 'react'

import { BookmarkStarIcon } from '@/components/BookmarkStarIcon'
import { invalidateCache } from '@/lib/api-cache'
import { parseBookmarkStateResponse, type BookmarkStatePayload } from '@/lib/bookmark-api-types'

type WordBookmarkButtonProps = {
  readonly wordId: string
  readonly initialBookmarked: boolean
  readonly size: 'base' | 'large'
  readonly word?: string
  readonly onBookmarkedChange?: (bookmarked: boolean) => void
}

export function WordBookmarkButton({ wordId, initialBookmarked, size, word, onBookmarkedChange }: WordBookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const desiredRef = useRef(initialBookmarked)
  const confirmedRef = useRef(initialBookmarked)
  const runningRef = useRef(false)

  async function writeDesiredState() {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (desiredRef.current !== confirmedRef.current) {
        const requestedState = desiredRef.current
        const payload: BookmarkStatePayload = { type: 'word', wordId, bookmarked: requestedState }
        let response: Response
        try {
          response = await fetch('/api/bookmarks/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        } catch (error) {
          if (!(error instanceof TypeError)) throw error
          if (desiredRef.current === requestedState) {
            desiredRef.current = confirmedRef.current
            setBookmarked(confirmedRef.current)
          }
          return
        }

        const savedState = response.ok ? parseBookmarkStateResponse(await response.json()) : null
        if (savedState === null) {
          if (desiredRef.current === requestedState) {
            desiredRef.current = confirmedRef.current
            setBookmarked(confirmedRef.current)
          }
          return
        }

        confirmedRef.current = savedState
        invalidateCache('/api/bookmarks')
        onBookmarkedChange?.(savedState)
        if (desiredRef.current === requestedState) {
          desiredRef.current = savedState
          setBookmarked(savedState)
        }
      }
    } finally {
      runningRef.current = false
    }
  }

  const label = `${bookmarked ? '取消收藏' : '收藏'}${word ? `单词 ${word}` : ''}`

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={bookmarked}
      onClick={() => {
        const desiredState = !bookmarked
        desiredRef.current = desiredState
        setBookmarked(desiredState)
        void writeDesiredState()
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-wait disabled:opacity-60 ${size === 'large' ? 'h-10 w-10' : 'h-8 w-8'} ${
        bookmarked
          ? 'word-bookmark-selected'
          : 'border-stone-200 bg-white text-stone-400 hover:border-amber-300 hover:text-amber-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500 dark:hover:border-amber-700 dark:hover:text-amber-400'
      }`}
      title={label}
    >
      <BookmarkStarIcon bookmarked={bookmarked} className={size === 'large' ? 'h-6 w-6' : 'h-5 w-5'} />
    </button>
  )
}
