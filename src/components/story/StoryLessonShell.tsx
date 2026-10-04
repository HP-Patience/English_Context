'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'

import type { PublicStoryLessonDetail, StoryProgressApiResponse } from '@/lib/story-api-types'
import type { UserStoryProgressDto } from '@/lib/story-service'
import type { StoryFirstPassStep } from '@/lib/story-progress'
import { CompletionDateHistory } from './CompletionDateHistory'
import { StoryFirstPassPanel, type FirstPassView } from './StoryFirstPassPanel'
import { StoryReinforcementSection } from './StoryReinforcementSection'
import { StoryStepNav } from './StoryStepNav'
import { StoryQuickNav } from './StoryQuickNav'
import { useStoryReviewQueue } from './useStoryReviewQueue'

export type StoryLessonView = Pick<
  PublicStoryLessonDetail,
  'id' | 'order' | 'title' | 'sourceChapterStart' | 'sourceChapterEnd' | 'content' | 'lessonWords' | 'reviewState' | 'completionSummary' | 'bookmarkedParagraphIndexes'
>

type StoryLessonShellProps = {
  readonly lesson: StoryLessonView
  readonly progress: UserStoryProgressDto
  readonly dueWords: number
  readonly previousLessonId?: string | null
  readonly nextLessonId?: string | null
}

function firstPassView(progress: UserStoryProgressDto): FirstPassView {
  if (progress.currentStep === 1) return 1
  if (progress.currentStep === 2) return 2
  return 3
}

function stepName(step: FirstPassView): string {
  if (step === 1) return '第一步'
  if (step === 2) return '第二步'
  return '第三步'
}

export function StoryLessonShell({ lesson, progress, dueWords, previousLessonId = null, nextLessonId = null }: StoryLessonShellProps) {
  const [savedProgress, setSavedProgress] = useState(progress)
  const [activeStep, setActiveStep] = useState<FirstPassView>(() => firstPassView(progress))
  const renderedStep = useDeferredValue(activeStep)
  const [savingStep, setSavingStep] = useState<StoryFirstPassStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bookmarkedParagraphIndexes, setBookmarkedParagraphIndexes] = useState<ReadonlySet<number>>(
    () => new Set(lesson.bookmarkedParagraphIndexes),
  )
  const review = useStoryReviewQueue(lesson, dueWords)

  function selectStep(step: FirstPassView) {
    setActiveStep(step)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  async function completeStep(step: StoryFirstPassStep) {
    if (savingStep !== null || savedProgress.completedStep >= step || step > savedProgress.completedStep + 1) return
    setSavingStep(step)
    setError(null)
    try {
      const response = await fetch(`/api/story/lessons/${encodeURIComponent(lesson.id)}/progress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step }),
      })
      if (!response.ok) throw new Error('progress request failed')
      const payload = await response.json() as StoryProgressApiResponse
      setSavedProgress(payload.progress)
      if (step < 3) selectStep((step + 1) as FirstPassView)
    } catch {
      setError('进度未能保存，请稍后重试。当前步骤不会被跳过。')
    } finally {
      setSavingStep(null)
    }
  }

  function handleParagraphBookmarkChange(paragraphIndex: number, bookmarked: boolean) {
    setBookmarkedParagraphIndexes((current) => {
      const next = new Set(current)
      if (bookmarked) next.add(paragraphIndex)
      else next.delete(paragraphIndex)
      return next
    })
  }

  const firstPassComplete = savedProgress.completedStep === 3
  const nextRequiredStep = Math.min(3, savedProgress.completedStep + 1) as FirstPassView
  const revisitingCompletedStep = !firstPassComplete && savedProgress.completedStep >= activeStep
  const viewingFutureStep = !firstPassComplete && activeStep > nextRequiredStep

  return (
    <article className="story-theme mx-auto max-w-3xl pb-14">
      <header className="pb-4">
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">第{lesson.order}篇 · {lesson.title}</h1>
        <p className="story-muted mt-2 text-xs leading-5">{lesson.sourceChapterStart} — {lesson.sourceChapterEnd} · {lesson.lessonWords.length} 个目标词</p>
      </header>

      <StoryStepNav currentStep={activeStep} completedStep={savedProgress.completedStep} onSelect={selectStep} />

      <div
        aria-busy={renderedStep !== activeStep}
        className={`story-step-panel ${renderedStep !== activeStep ? 'story-step-panel-pending' : ''}`}
      >
        <StoryFirstPassPanel
          lessonId={lesson.id}
          activeStep={renderedStep}
          paragraphs={lesson.content.paragraphs}
          lessonWords={lesson.lessonWords}
          completionSummary={lesson.completionSummary}
          bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
          onParagraphBookmarkChange={handleParagraphBookmarkChange}
        />
      </div>

      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-3 border-t border-stone-300 pt-6 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
        {!firstPassComplete ? (
          <button
            type="button"
            disabled={savingStep !== null}
            onClick={() => {
              if (viewingFutureStep || revisitingCompletedStep) selectStep(nextRequiredStep)
              else void completeStep(activeStep)
            }}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-red-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-red-800 dark:hover:bg-red-700 dark:focus-visible:ring-offset-stone-950"
          >
            {viewingFutureStep || revisitingCompletedStep
              ? `返回${stepName(nextRequiredStep)}`
              : savingStep === activeStep ? '正在保存…'
                : activeStep === 1 ? '完成第一步，进入回忆'
                  : activeStep === 2 ? '完成第二步，查看词册' : '完成第三步'}
          </button>
        ) : (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--story-muted)]">本篇学习已完成</p>
            <Link href={nextLessonId ? `/story/${nextLessonId}` : '/story'} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--story-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] focus-visible:ring-offset-2">
              {nextLessonId ? '进入下一篇' : '返回课程列表'}
            </Link>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <CompletionDateHistory
          endpoint={`/api/story/lessons/${encodeURIComponent(lesson.id)}/completions`}
          label="本篇完成日期"
          summaryLabel="本篇已学习"
          initialCount={lesson.completionSummary.lesson.count}
          latestDate={lesson.completionSummary.lesson.latestDate}
          lazy
          compact
          manageable
        />
        <CompletionDateHistory
          key={renderedStep}
          endpoint={`/api/story/lessons/${encodeURIComponent(lesson.id)}/steps/${renderedStep}/completions`}
          label={`${renderedStep === 1 ? '第一' : renderedStep === 2 ? '第二' : '第三'}步完成日期`}
          summaryLabel="本步骤已学习"
          lazy
          compact
          manageable
        />
      </div>

      <StoryReinforcementSection
        state={{
          firstPassComplete,
          dueCount: review.dueCount,
          words: review.words,
          attempts: review.attempts,
          loaded: review.loaded,
          loading: review.loading,
          error: review.error,
        }}
        onLoad={() => void review.load()}
        onSubmit={review.submit}
      />
      <StoryQuickNav
        currentStep={activeStep}
        onSelect={selectStep}
        previousLessonId={previousLessonId}
        nextLessonId={nextLessonId}
      />
    </article>
  )
}
