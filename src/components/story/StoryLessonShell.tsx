'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { PublicStoryLessonDetail, StoryProgressApiResponse } from '@/lib/story-api-types'
import type { UserStoryProgressDto } from '@/lib/story-service'
import type { StoryFirstPassStep } from '@/lib/story-progress'
import { CompletionDateHistory } from './CompletionDateHistory'
import { StoryFirstPassPanel, type FirstPassView } from './StoryFirstPassPanel'
import type { StoryRecallRating } from './StoryRecall'
import { StoryReinforcementSection } from './StoryReinforcementSection'
import { StoryStepNav } from './StoryStepNav'
import { useStoryReviewQueue } from './useStoryReviewQueue'

export type StoryLessonView = Pick<
  PublicStoryLessonDetail,
  'id' | 'order' | 'title' | 'sourceChapterStart' | 'sourceChapterEnd' | 'content' | 'lessonWords' | 'reviewState' | 'completionSummary' | 'bookmarkedParagraphIndexes'
>

type StoryLessonShellProps = {
  readonly lesson: StoryLessonView
  readonly progress: UserStoryProgressDto
  readonly dueWords: number
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

export function StoryLessonShell({ lesson, progress, dueWords, nextLessonId = null }: StoryLessonShellProps) {
  const [savedProgress, setSavedProgress] = useState(progress)
  const [activeStep, setActiveStep] = useState<FirstPassView>(() => firstPassView(progress))
  const [savingStep, setSavingStep] = useState<StoryFirstPassStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recallStatus, setRecallStatus] = useState<string | null>(null)
  const [bookmarkedParagraphIndexes, setBookmarkedParagraphIndexes] = useState<ReadonlySet<number>>(
    () => new Set(lesson.bookmarkedParagraphIndexes),
  )
  const review = useStoryReviewQueue(lesson, dueWords)

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
      if (step < 3) setActiveStep((step + 1) as FirstPassView)
    } catch {
      setError('进度未能保存，请稍后重试。当前步骤不会被跳过。')
    } finally {
      setSavingStep(null)
    }
  }

  function handleRate(lessonWordId: string, rating: StoryRecallRating) {
    const word = lesson.lessonWords.find((item) => item.id === lessonWordId)
    setRecallStatus(`${word?.word.text ?? '目标词'}：${rating}`)
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
      <header className="story-header relative overflow-hidden rounded-3xl border px-5 py-7 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="absolute -right-4 -top-5 h-28 w-28 rotate-12 rounded-3xl border-2 border-red-900/15 dark:border-red-600/20" />
        <div className="relative flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="story-kicker text-[0.68rem] font-semibold uppercase tracking-[0.28em]">Chronicle · Lesson {String(lesson.order).padStart(2, '0')}</p>
            <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">{lesson.title}</h1>
            <p className="story-muted mt-3 text-sm leading-6">{lesson.sourceChapterStart} — {lesson.sourceChapterEnd} · {lesson.lessonWords.length} 个目标词</p>
          </div>
          <div aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center border-2 border-red-900/60 font-serif text-xs font-bold leading-tight text-red-900/75 dark:border-red-700 dark:text-red-400">第{lesson.order}<br />篇</div>
        </div>
        <div className="relative mt-5">
          <CompletionDateHistory
            endpoint={`/api/story/lessons/${encodeURIComponent(lesson.id)}/completions`}
            label="本篇完成日期"
            summaryLabel="本篇已学习"
            initialCount={lesson.completionSummary.lesson.count}
            latestDate={lesson.completionSummary.lesson.latestDate}
            manageable
          />
        </div>
      </header>

      <div className="mt-4 shadow-lg shadow-stone-950/10">
        <StoryStepNav currentStep={activeStep} completedStep={savedProgress.completedStep} onSelect={setActiveStep} />
      </div>

      <StoryFirstPassPanel
        lessonId={lesson.id}
        activeStep={activeStep}
        paragraphs={lesson.content.paragraphs}
        lessonWords={lesson.lessonWords}
        completionSummary={lesson.completionSummary}
        bookmarkedParagraphIndexes={bookmarkedParagraphIndexes}
        onParagraphBookmarkChange={handleParagraphBookmarkChange}
        onRate={handleRate}
        recallStatus={recallStatus}
      />

      {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-3 border-t border-stone-300 pt-6 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
        {!firstPassComplete ? (
          <button
            type="button"
            disabled={savingStep !== null}
            onClick={() => {
              if (viewingFutureStep || revisitingCompletedStep) setActiveStep(nextRequiredStep)
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
          <div className="w-full rounded-2xl border border-emerald-700/30 bg-emerald-50 p-5 dark:border-emerald-700/50 dark:bg-emerald-950/30">
            <p className="font-serif text-xl font-bold text-emerald-950 dark:text-emerald-100">首次学习已经归卷</p>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80 dark:text-emerald-200/80">Step4 不会阻塞下一篇；到期强化可稍后分轮完成。</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href={nextLessonId ? `/story/${nextLessonId}` : '/story'} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 dark:bg-emerald-700 dark:hover:bg-emerald-600 dark:focus-visible:ring-offset-stone-950">
                {nextLessonId ? '进入下一篇' : '返回课程卷宗'}
              </Link>
              <Link href="#step-4" onClick={() => { if (!review.loaded && !review.loading) void review.load() }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-800/30 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950">
                {review.dueCount > 0 ? `查看 ${review.dueCount} 个到期强化词` : '查看 Step4 强化说明'}
              </Link>
            </div>
          </div>
        )}
        {!firstPassComplete ? <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">日期历史可独立记录；首次学习进度仍按顺序保存。</p> : null}
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
    </article>
  )
}
