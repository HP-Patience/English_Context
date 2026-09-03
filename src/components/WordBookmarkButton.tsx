'use client'

import { useRef, useState } from 'react'

import { invalidateCache } from '@/lib/api-cache'
import { parseBookmarkStateResponse, type BookmarkStatePayload } from '@/lib/bookmark-api-types'

type WordBookmarkButtonProps = {
  readonly wordId: string
  readonly initialBookmarked: boolean
  readonly size: 'base' | 'large'
}

export function WordBookmarkButton({ wordId, initialBookmarked, size }: WordBookmarkButtonProps) {
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
        if (desiredRef.current === requestedState) {
          desiredRef.current = savedState
          setBookmarked(savedState)
        }
      }
    } finally {
      runningRef.current = false
    }
  }

  return (
    <button
      type="button"
      aria-label={bookmarked ? '取消收藏' : '收藏'}
      aria-pressed={bookmarked}
      onClick={() => {
        const desiredState = !bookmarked
        desiredRef.current = desiredState
        setBookmarked(desiredState)
        void writeDesiredState()
      }}
      className={`${size === 'large' ? 'text-lg' : 'text-base'} ${
        bookmarked
          ? 'text-amber-500'
          : 'text-stone-300 hover:text-amber-400 dark:text-stone-600 dark:hover:text-amber-400'
      }`}
      title={bookmarked ? '取消收藏' : '收藏'}
    >
      {bookmarked ? '★' : '☆'}
    </button>
  )
}
