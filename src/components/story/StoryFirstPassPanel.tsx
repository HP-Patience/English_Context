'use client'

import { useMemo, useState } from 'react'

import SelectionSearch from '@/components/SelectionSearch'
import type { StoryCompletionSummary } from '@/lib/story-completion'
import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { CompletionDateHistory } from './CompletionDateHistory'
import { StoryReader } from './StoryReader'
import { StoryRecall, type StoryRecallRating } from './StoryRecall'
import type { StoryWordDisplay } from './StoryWordDetail'
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
  readonly onRate: (lessonWordId: string, rating: StoryRecallRating) => void
  readonly recallStatus: string | null
}

const stepHeading: Record<FirstPassView, string> = {
  1: '第一步 · 入境识词',
  2: '第二步 · 遮义回想',
  3: '第三步 · 归卷复习',
}

const stepDescription: Record<FirstPassView, string> = {
  1: '顺着剧情阅读，英文目标词与本篇语境释义同时出现。',
  2: '英文仍留在故事里，先回想，再按需要揭开释义并自评。',
  3: '按场景核对本篇完整词册；完成后即可继续下一篇。',
}

function buildWordLedger(
  paragraphs: readonly StoryLessonParagraph[],
  lessonWords: readonly StoryLessonWordDto[],
): StoryWordDisplay[] {
  const sceneByOrder = new Map<number, { sceneTitle: string; storyUsage: string }>()
  for (const paragraph of paragraphs) {
    const storyUsage = paragraph.segments.map((segment) => segment.type === 'text' ? segment.value : segment.word).join('').trim()
    for (const segment of paragraph.segments) {
      if (segment.type === 'targetWord') sceneByOrder.set(segment.wordOrder, { sceneTitle: paragraph.sceneTitle, storyUsage })
    }
  }
  return lessonWords.map((word) => ({
    ...word,
    sceneTitle: sceneByOrder.get(word.sortOrder)?.sceneTitle ?? '未分场',
    storyUsage: sceneByOrder.get(word.sortOrder)?.storyUsage ?? null,
  }))
}

export function StoryFirstPassPanel({
  lessonId,
  activeStep,
  paragraphs,
  lessonWords,
  completionSummary,
  bookmarkedParagraphIndexes,
  onParagraphBookmarkChange,
  onRate,
  recallStatus,
}: StoryFirstPassPanelProps) {
  const [query, setQuery] = useState('')
  const [scene, setScene] = useState('')
  const [completionDelta, setCompletionDelta] = useState(0)
  const wordLedger = useMemo(() => buildWordLedger(paragraphs, lessonWords), [paragraphs, lessonWords])
  const scenes = useMemo(() => [...new Set(wordLedger.map((word) => word.sceneTitle))], [wordLedger])
  const completedCards = Math.min(
    completionSummary.paragraph.totalCards,
    Math.max(0, completionSummary.paragraph.completedCards + completionDelta),
  )

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
            completedCards={completedCards}
            totalCards={completionSummary.paragraph.totalCards}
            bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
            onParagraphBookmarkChange={onParagraphBookmarkChange}
            onParagraphCompletionDelta={(_paragraphIndex, delta) => setCompletionDelta((current) => current + delta)}
          />
        </SelectionSearch>
      ) : null}
      {activeStep === 2 ? (
        <SelectionSearch>
          <StoryRecall
            lessonId={lessonId}
            paragraphs={paragraphs}
            lessonWords={lessonWords}
            completedCards={completedCards}
            totalCards={completionSummary.paragraph.totalCards}
            bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
            onParagraphBookmarkChange={onParagraphBookmarkChange}
            onParagraphCompletionDelta={(_paragraphIndex, delta) => setCompletionDelta((current) => current + delta)}
            onRate={onRate}
          />
        </SelectionSearch>
      ) : null}
      {recallStatus && activeStep === 2 ? (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {recallStatus}
        </p>
      ) : null}
      {activeStep === 3 ? (
        <div>
          <div className="mb-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)] sm:p-5">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
              搜索本篇词册
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入单词、词义或用法" className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-700/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100" />
            </label>
            <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
              按场景筛选
              <select value={scene} onChange={(event) => setScene(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-base text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100">
                <option value="">全部场景</option>
                {scenes.map((sceneTitle) => <option key={sceneTitle} value={sceneTitle}>{sceneTitle}</option>)}
              </select>
            </label>
          </div>
          <SelectionSearch><StoryWordList lessonWords={wordLedger} query={query} scene={scene} /></SelectionSearch>
        </div>
      ) : null}
    </section>
  )
}
