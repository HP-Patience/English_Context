'use client'

import { useState } from 'react'

import SelectionSearch from '@/components/SelectionSearch'
import type { StoryCompletionSummary } from '@/lib/story-completion'
import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { CompletionDateHistory } from './CompletionDateHistory'
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

const stepDescription: Record<FirstPassView, string> = {
  1: '顺着剧情阅读，英文目标词与本篇语境释义同时出现。',
  2: '重读完整故事，英文仍留在原处；先回想，再按需要揭开段内释义。',
  3: '按顺序快速回想本篇单词，点击右侧逐个核对释义。',
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
      <div className="mb-6 space-y-4 border-b border-[var(--story-line)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--story-muted)]">First passage</p>
          <h2 id={`step-${activeStep}-title`} className="mt-1 font-serif text-2xl font-bold text-[var(--story-ink)]">
            {stepHeading[activeStep]}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--story-muted)]">{stepDescription[activeStep]}</p>
        </div>
        <CompletionDateHistory
          key={activeStep}
          endpoint={`/api/story/lessons/${encodeURIComponent(lessonId)}/steps/${activeStep}/completions`}
          label={`${activeStep === 1 ? '第一' : activeStep === 2 ? '第二' : '第三'}步完成日期`}
          summaryLabel="本步骤已学习"
          manageable
        />
      </div>

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
