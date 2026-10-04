'use client'

import { useState } from 'react'

import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { StoryParagraphCard } from './StoryParagraphCard'

type StoryReaderProps = {
  readonly lessonId: string
  readonly paragraphs: readonly StoryLessonParagraph[]
  readonly lessonWords: readonly StoryLessonWordDto[]
  readonly mode: 'learn' | 'recall'
  readonly completedCards: number
  readonly totalCards: number
  readonly completedParagraphIndexes?: ReadonlySet<number>
  readonly bookmarkedParagraphIndexes: ReadonlySet<number>
  readonly onParagraphBookmarkChange: (paragraphIndex: number, bookmarked: boolean) => void
  readonly onParagraphCompletionDelta?: (paragraphIndex: number, delta: 1 | -1) => void
  readonly onFirstParagraphCompletion?: (paragraphIndex: number) => void
}

export function StoryReader({
  lessonId,
  paragraphs,
  lessonWords,
  mode,
  completedCards,
  totalCards,
  completedParagraphIndexes = new Set<number>(),
  bookmarkedParagraphIndexes,
  onParagraphBookmarkChange,
  onParagraphCompletionDelta,
  onFirstParagraphCompletion,
}: StoryReaderProps) {
  const [completionDelta, setCompletionDelta] = useState(0)
  const sharedCompletedCards = Math.min(
    totalCards,
    Math.max(0, completedCards + (onParagraphCompletionDelta || onFirstParagraphCompletion ? 0 : completionDelta)),
  )
  const firstIncompleteParagraph = sharedCompletedCards < totalCards
    ? paragraphs.findIndex((_paragraph, index) => !completedParagraphIndexes.has(index))
    : -1

  return (
    <div>
      <div className="mb-5 max-w-40 text-xs text-[var(--story-muted)]">
        <p>故事学习进度 {sharedCompletedCards}/{totalCards}</p>
        {totalCards > 0 ? (
          <div role="progressbar" aria-label="段落完成进度" aria-valuemin={0} aria-valuemax={totalCards} aria-valuenow={sharedCompletedCards} aria-valuetext={`已完成 ${sharedCompletedCards} 段，共 ${totalCards} 段`} className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--story-line)]">
            <div className="h-full bg-[var(--story-accent)]" style={{ width: `${Math.min(100, Math.round((sharedCompletedCards / totalCards) * 100))}%` }} />
          </div>
        ) : null}
      </div>
      <div className="space-y-8">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <StoryParagraphCard
            key={`${paragraph.sceneTitle}-${paragraphIndex}`}
            lessonId={lessonId}
            paragraph={paragraph}
            paragraphIndex={paragraphIndex}
            lessonWords={lessonWords}
            mode={mode}
            showProgress={false}
            completedCards={sharedCompletedCards}
            totalCards={totalCards}
            bookmarked={bookmarkedParagraphIndexes.has(paragraphIndex)}
            onBookmarkedChange={(bookmarked) => onParagraphBookmarkChange(paragraphIndex, bookmarked)}
            onCompletionDelta={(delta) => {
              if (onParagraphCompletionDelta) onParagraphCompletionDelta(paragraphIndex, delta)
              else if (onFirstParagraphCompletion && delta === 1) onFirstParagraphCompletion(paragraphIndex)
              else setCompletionDelta((current) => current + delta)
            }}
          />
        ))}
      </div>
      {firstIncompleteParagraph >= 0 ? (
        <button
          type="button"
          aria-label={`跳到第 ${firstIncompleteParagraph + 1} 个未完成段落`}
          title={`跳到第 ${firstIncompleteParagraph + 1} 个未完成段落`}
          onClick={() => {
            const target = document.getElementById(`story-paragraph-${firstIncompleteParagraph}`)
            if (target) scrollToPosition(Math.max(0, window.scrollY + target.getBoundingClientRect().top - 24))
          }}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-[var(--story-accent-line)] bg-[var(--story-surface)] text-xl font-bold text-[var(--story-muted)] hover:border-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:bottom-6 sm:right-6"
        >
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}
    </div>
  )
}

function scrollToPosition(top: number) {
  const start = window.scrollY
  const distance = top - start
  if (document.visibilityState !== 'visible' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, top)
    return
  }

  const startedAt = performance.now()
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / 250)
    const eased = 1 - Math.pow(1 - progress, 3)
    window.scrollTo(0, start + distance * eased)
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
