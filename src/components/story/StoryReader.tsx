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

  return (
    <div className="space-y-8">
      {paragraphs.map((paragraph, paragraphIndex) => (
        <StoryParagraphCard
          key={`${paragraph.sceneTitle}-${paragraphIndex}`}
          lessonId={lessonId}
          paragraph={paragraph}
          paragraphIndex={paragraphIndex}
          lessonWords={lessonWords}
          mode={mode}
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
  )
}
