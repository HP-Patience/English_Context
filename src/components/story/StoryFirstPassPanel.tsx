'use client'

import { useState } from 'react'

import SelectionSearch from '@/components/SelectionSearch'
import type { StoryCompletionSummary } from '@/lib/story-completion'
import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { StoryReader } from './StoryReader'
import { StoryWordList } from './StoryWordList'

export type FirstPassView = 1 | 2 | 3

type StoryFirstPassPanelProps = {
  readonly lessonId: string
  readonly activeStep: FirstPassView
  readonly paragraphs: readonly StoryLessonParagraph[]
  readonly lessonWords: readonly StoryLessonWordDto[]
  readonly completionSummary: StoryCompletionSummary
  readonly bookmarkedParagraphIndexes: ReadonlySet<number>
  readonly onParagraphBookmarkChange: (paragraphIndex: number, bookmarked: boolean) => void
}

const stepHeading: Record<FirstPassView, string> = {
  1: '第一步 · 入境识词',
  2: '第二步 · 遮义回想',
  3: '第三步 · 归卷复习',
}

export function StoryFirstPassPanel({
  lessonId,
  activeStep,
  paragraphs,
  lessonWords,
  completionSummary,
  bookmarkedParagraphIndexes,
  onParagraphBookmarkChange,
}: StoryFirstPassPanelProps) {
  const [paragraphProgress, setParagraphProgress] = useState(() => ({
    1: initialParagraphProgress(completionSummary, 1),
    2: initialParagraphProgress(completionSummary, 2),
  }))
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState<ReadonlySet<string>>(
    () => new Set(lessonWords.filter((word) => word.bookmarked).map((word) => word.word.id)),
  )
  const activeParagraphStep = activeStep === 2 ? 2 : 1
  const activeParagraphProgress = paragraphProgress[activeParagraphStep]

  function handleParagraphCompletionDelta(paragraphIndex: number, delta: 1 | -1) {
    setParagraphProgress((current) => {
      const stepProgress = current[activeParagraphStep]
      const completedParagraphIndexes = new Set(stepProgress.completedParagraphIndexes)
      if (delta === 1) completedParagraphIndexes.add(paragraphIndex)
      else completedParagraphIndexes.delete(paragraphIndex)
      return {
        ...current,
        [activeParagraphStep]: {
          completedCards: Math.min(
            completionSummary.paragraph.totalCards,
            Math.max(0, stepProgress.completedCards + delta),
          ),
          completedParagraphIndexes,
        },
      }
    })
  }

  return (
    <section aria-labelledby={`step-${activeStep}-title`} className="mt-7">
      <h2 id={`step-${activeStep}-title`} className="sr-only">{stepHeading[activeStep]}</h2>
      {activeStep === 1 ? (
        <SelectionSearch>
          <StoryReader
            lessonId={lessonId}
            paragraphs={paragraphs}
            lessonWords={lessonWords}
            mode="learn"
            completedCards={activeParagraphProgress.completedCards}
            completedParagraphIndexes={activeParagraphProgress.completedParagraphIndexes}
            totalCards={completionSummary.paragraph.totalCards}
            bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
            onParagraphBookmarkChange={onParagraphBookmarkChange}
            onParagraphCompletionDelta={handleParagraphCompletionDelta}
          />
        </SelectionSearch>
      ) : null}
      {activeStep === 2 ? (
        <SelectionSearch>
          <StoryReader
            lessonId={lessonId}
            paragraphs={paragraphs}
            lessonWords={lessonWords}
            mode="recall"
            completedCards={activeParagraphProgress.completedCards}
            completedParagraphIndexes={activeParagraphProgress.completedParagraphIndexes}
            totalCards={completionSummary.paragraph.totalCards}
            bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
            onParagraphBookmarkChange={onParagraphBookmarkChange}
            onParagraphCompletionDelta={handleParagraphCompletionDelta}
          />
        </SelectionSearch>
      ) : null}
      {activeStep === 3 ? (
        <SelectionSearch>
          <StoryWordList
            lessonWords={lessonWords}
            bookmarkedWordIds={bookmarkedWordIds}
            onWordBookmarkedChange={(wordId, bookmarked) => {
              setBookmarkedWordIds((current) => {
                const next = new Set(current)
                if (bookmarked) next.add(wordId)
                else next.delete(wordId)
                return next
              })
            }}
          />
        </SelectionSearch>
      ) : null}
    </section>
  )
}

function initialParagraphProgress(summary: StoryCompletionSummary, step: 1 | 2) {
  const stepSummary = summary.paragraphByStep?.[step]
  return {
    completedCards: stepSummary?.completedCards ?? (step === 1 ? summary.paragraph.completedCards : 0),
    completedParagraphIndexes: new Set(stepSummary?.completedParagraphIndexes ?? []),
  }
}
