'use client'

import Link from 'next/link'
import { useState } from 'react'

import PronounceButton from '@/components/PronounceButton'
import { WordBookmarkButton } from '@/components/WordBookmarkButton'
import type { StoryLessonWordDto } from '@/lib/story-service'

type StoryWordListProps = {
  readonly lessonWords: readonly StoryLessonWordDto[]
  readonly bookmarkedWordIds?: ReadonlySet<string>
  readonly onWordBookmarkedChange?: (wordId: string, bookmarked: boolean) => void
}

export function StoryWordList({ lessonWords, bookmarkedWordIds, onWordBookmarkedChange }: StoryWordListProps) {
  const [revealedWordIds, setRevealedWordIds] = useState<ReadonlySet<string>>(() => new Set())
  const orderedWords = [...lessonWords].sort((left, right) => left.sortOrder - right.sortOrder)

  function toggleGloss(lessonWordId: string) {
    setRevealedWordIds((current) => {
      const next = new Set(current)
      if (next.has(lessonWordId)) next.delete(lessonWordId)
      else next.add(lessonWordId)
      return next
    })
  }

  return (
    <ol aria-label="本篇目标词" className="divide-y divide-[var(--story-line)] rounded-2xl border border-[var(--story-line)] bg-[var(--story-surface)] px-4 sm:px-5">
      {orderedWords.map((lessonWord) => {
        const visible = revealedWordIds.has(lessonWord.id)
        return (
          <li key={lessonWord.id} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)] items-center gap-3 py-3 sm:gap-5">
            <div className="flex min-w-0 items-center gap-1.5">
              <PronounceButton word={lessonWord.word.text} />
              <WordBookmarkButton
                wordId={lessonWord.word.id}
                word={lessonWord.word.text}
                initialBookmarked={bookmarkedWordIds?.has(lessonWord.word.id) ?? lessonWord.bookmarked}
                size="base"
                onBookmarkedChange={(bookmarked) => onWordBookmarkedChange?.(lessonWord.word.id, bookmarked)}
              />
              <Link
                href={`/word/${encodeURIComponent(lessonWord.word.id)}`}
                lang="en"
                className="ml-1 min-w-0 break-words rounded-sm font-serif text-lg font-semibold text-[var(--story-ink)] underline decoration-[var(--story-accent-line)] underline-offset-4 transition-colors duration-200 hover:text-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
              >
                {lessonWord.word.text}
              </Link>
            </div>
            <button
              type="button"
              aria-expanded={visible}
              aria-pressed={visible}
              aria-label={visible
                ? `隐藏 ${lessonWord.word.text} 的释义：${lessonWord.glossCn}`
                : `显示 ${lessonWord.word.text} 的释义`}
              onClick={() => toggleGloss(lessonWord.id)}
              className="inline-grid min-h-10 min-w-0 grid-cols-1 grid-rows-1 place-items-center rounded-lg border border-dashed border-[var(--story-accent-line)] bg-[var(--story-bg)] px-3 py-2 text-center text-xs font-semibold text-[var(--story-ink)] hover:border-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
            >
              <span
                aria-hidden={!visible}
                lang="zh-CN"
                className={`col-start-1 row-start-1 break-words transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`}
              >
                {lessonWord.glossCn}
              </span>
              <span
                aria-hidden={visible}
                className={`col-start-1 row-start-1 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-0' : 'opacity-100'}`}
              >
                点击查看释义
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
