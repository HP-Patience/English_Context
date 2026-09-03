'use client'

import { useState } from 'react'

import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { StoryReader } from './StoryReader'

export type StoryRecallRating = '记得' | '模糊' | '忘记'

type StoryRecallProps = {
  lessonId: string
  paragraphs: readonly StoryLessonParagraph[]
  lessonWords: readonly StoryLessonWordDto[]
  completedCards: number
  totalCards: number
  bookmarkedParagraphIndexes: ReadonlySet<number>
  onParagraphBookmarkChange: (paragraphIndex: number, bookmarked: boolean) => void
  onParagraphCompletionDelta?: (paragraphIndex: number, delta: 1 | -1) => void
  onRate?: (lessonWordId: string, rating: StoryRecallRating) => void
}

type RecallGlossControlProps = {
  word: string
  gloss: string
  visible: boolean
  onVisibleChange: (visible: boolean) => void
}

export function RecallGlossControl({ word, gloss, visible, onVisibleChange }: RecallGlossControlProps) {
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={visible}
        aria-pressed={visible}
        aria-label={`${visible ? '隐藏' : '显示'} ${word} 的释义`}
        onClick={() => onVisibleChange(!visible)}
        className="min-h-11 rounded-xl border border-red-800/30 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950"
      >
        {visible ? gloss : '回想后显示释义'}
      </button>
    </div>
  )
}

export function StoryRecall({
  lessonId,
  paragraphs,
  lessonWords,
  completedCards,
  totalCards,
  bookmarkedParagraphIndexes,
  onParagraphBookmarkChange,
  onParagraphCompletionDelta,
  onRate,
}: StoryRecallProps) {
  const orderedWords = [...lessonWords].sort((left, right) => left.sortOrder - right.sortOrder)
  const [activeIndex, setActiveIndex] = useState(0)
  const [revealedWordId, setRevealedWordId] = useState<string | null>(null)
  const activeWord = orderedWords[activeIndex]

  function selectWord(index: number) {
    setActiveIndex(index)
    setRevealedWordId(null)
  }

  return (
    <div className="space-y-8">
      <StoryReader
        lessonId={lessonId}
        paragraphs={paragraphs}
        lessonWords={lessonWords}
        mode="recall"
        completedCards={completedCards}
        totalCards={totalCards}
        bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
        onParagraphBookmarkChange={onParagraphBookmarkChange}
        onParagraphCompletionDelta={onParagraphCompletionDelta}
      />

      {activeWord ? (
        <section aria-labelledby="recall-check-title" className="rounded-2xl border border-stone-300 bg-stone-100 p-5 dark:border-stone-700 dark:bg-stone-900 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                Recall {activeIndex + 1} / {orderedWords.length}
              </p>
              <h3 id="recall-check-title" className="mt-2 font-serif text-3xl font-bold text-stone-950 dark:text-stone-50" lang="en">
                {activeWord.word.text}
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => selectWord(Math.max(0, activeIndex - 1))}
                className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
              >
                上一个
              </button>
              <button
                type="button"
                disabled={activeIndex === orderedWords.length - 1}
                onClick={() => selectWord(Math.min(orderedWords.length - 1, activeIndex + 1))}
                className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-200"
              >
                下一个
              </button>
            </div>
          </div>

          <RecallGlossControl
            word={activeWord.word.text}
            gloss={activeWord.glossCn}
            visible={revealedWordId === activeWord.id}
            onVisibleChange={(visible) => setRevealedWordId(visible ? activeWord.id : null)}
          />

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-stone-700 dark:text-stone-200">这次回想得怎样？</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['记得', '模糊', '忘记'] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  disabled={revealedWordId !== activeWord.id}
                  onClick={() => onRate?.(activeWord.id, rating)}
                  className="min-h-11 rounded-xl border border-stone-300 bg-white px-2 py-2 text-sm font-semibold text-stone-700 transition enabled:hover:border-red-700 enabled:hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:enabled:hover:border-red-600 dark:enabled:hover:text-red-300"
                >
                  {rating}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
            自评只帮助本轮回想，不会提前写入 Step4 强化记录。
          </p>
        </section>
      ) : null}
    </div>
  )
}
