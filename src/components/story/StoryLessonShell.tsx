'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

import type {
  PublicStoryLessonDetail,
  StoryProgressApiResponse,
  StoryReviewApiResponse,
  StoryReviewQueueApiResponse,
} from '@/lib/story-api-types'
import type { UserStoryProgressDto } from '@/lib/story-service'
import type { StoryFirstPassStep } from '@/lib/story-progress'
import { StoryReader } from './StoryReader'
import {
  StoryReviewTable,
  type StoryReviewAttemptView,
  type StoryReviewRound,
  type StoryReviewSubmission,
  type StoryReviewTableWord,
} from './StoryReviewTable'
import { StoryRecall, type StoryRecallRating } from './StoryRecall'
import { StoryStepNav } from './StoryStepNav'
import { StoryWordList } from './StoryWordList'
import type { StoryWordDisplay } from './StoryWordDetail'

type FirstPassView = 1 | 2 | 3

export type StoryLessonView = Pick<
  PublicStoryLessonDetail,
  'id' | 'order' | 'title' | 'sourceChapterStart' | 'sourceChapterEnd' | 'content' | 'lessonWords'
>

type StoryLessonShellProps = {
  lesson: StoryLessonView
  progress: UserStoryProgressDto
  dueWords: number
  nextLessonId?: string | null
}

function firstPassView(progress: UserStoryProgressDto): FirstPassView {
  if (progress.currentStep === 1) return 1
  if (progress.currentStep === 2) return 2
  return 3
}

function buildWordLedger(lesson: StoryLessonView): StoryWordDisplay[] {
  const sceneByOrder = new Map<number, { sceneTitle: string; storyUsage: string }>()

  for (const paragraph of lesson.content.paragraphs) {
    const storyUsage = paragraph.segments
      .map((segment) => segment.type === 'text' ? segment.value : segment.word)
      .join('')
      .trim()

    for (const segment of paragraph.segments) {
      if (segment.type === 'targetWord') {
        sceneByOrder.set(segment.wordOrder, { sceneTitle: paragraph.sceneTitle, storyUsage })
      }
    }
  }

  return lesson.lessonWords.map((word) => ({
    ...word,
    sceneTitle: sceneByOrder.get(word.sortOrder)?.sceneTitle ?? '未分场',
    storyUsage: sceneByOrder.get(word.sortOrder)?.storyUsage ?? null,
  }))
}

function toReviewRound(value: number): StoryReviewRound | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value
  return null
}

function buildReviewWords(lesson: StoryLessonView): StoryReviewTableWord[] {
  return lesson.lessonWords.map((word) => ({
    lessonWordId: word.id,
    word: word.word.text,
    gloss: word.glossCn,
    phonetic: word.word.phonetic,
    partOfSpeech: word.meaning.partOfSpeech,
    dueRound: null,
    roundCompleted: 0,
    nextReviewAt: null,
    isDue: false,
  }))
}

const noReviewAttempts: StoryReviewAttemptView[] = []

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

export function StoryLessonShell({ lesson, progress, dueWords, nextLessonId = null }: StoryLessonShellProps) {
  const [savedProgress, setSavedProgress] = useState(progress)
  const [activeStep, setActiveStep] = useState<FirstPassView>(() => firstPassView(progress))
  const [savingStep, setSavingStep] = useState<StoryFirstPassStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recallStatus, setRecallStatus] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scene, setScene] = useState('')
  const [reviewWords, setReviewWords] = useState<StoryReviewTableWord[]>(() => buildReviewWords(lesson))
  const [reviewQueueLoaded, setReviewQueueLoaded] = useState(false)
  const [reviewQueueLoading, setReviewQueueLoading] = useState(false)
  const [reviewQueueError, setReviewQueueError] = useState<string | null>(null)
  const [currentDueWords, setCurrentDueWords] = useState(dueWords)
  const wordLedger = useMemo(() => buildWordLedger(lesson), [lesson])
  const scenes = useMemo(
    () => [...new Set(wordLedger.map((word) => word.sceneTitle))],
    [wordLedger],
  )

  const loadReviewQueue = useCallback(async () => {
    setReviewQueueLoading(true)
    setReviewQueueError(null)
    try {
      const response = await fetch(`/api/story/review?lessonId=${encodeURIComponent(lesson.id)}`)
      if (!response.ok) throw new Error('review queue request failed')

      const payload = await response.json() as StoryReviewQueueApiResponse
      const lessonQueue = payload.lessons.find((group) => group.lessonId === lesson.id)
      const dueByLessonWordId = new Map((lessonQueue?.words ?? []).map((word) => [word.lessonWordId, word]))
      setReviewWords((current) => current.map((word) => {
        const dueWord = dueByLessonWordId.get(word.lessonWordId)
        if (!dueWord) return { ...word, isDue: false }
        const dueRound = toReviewRound(dueWord.dueRound)
        return {
          ...word,
          dueRound,
          roundCompleted: dueWord.roundCompleted,
          nextReviewAt: dueWord.nextReviewAt,
          isDue: dueRound !== null,
        }
      }))
      setCurrentDueWords(lessonQueue?.dueCount ?? 0)
      setReviewQueueLoaded(true)
    } catch {
      setReviewQueueError('到期强化列表未能载入。现有学习进度未改变，请重试。')
    } finally {
      setReviewQueueLoading(false)
    }
  }, [lesson.id])

  async function submitReview(submission: StoryReviewSubmission) {
    const response = await fetch('/api/story/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    })
    if (!response.ok) throw new Error('review request failed')

    const payload = await response.json() as StoryReviewApiResponse
    setCurrentDueWords((current) => Math.max(0, current - 1))
    return payload.review
  }

  async function completeStep(step: StoryFirstPassStep) {
    if (savingStep !== null || savedProgress.completedStep >= step) return
    if (step > savedProgress.completedStep + 1) return

    setSavingStep(step)
    setError(null)
    try {
      const response = await fetch(`/api/story/lessons/${encodeURIComponent(lesson.id)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
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

  const firstPassComplete = savedProgress.completedStep === 3
  const revisitingCompletedStep = !firstPassComplete && savedProgress.completedStep >= activeStep
  const nextUnlockedStep = Math.min(3, savedProgress.completedStep + 1) as FirstPassView

  return (
    <article className="mx-auto max-w-3xl pb-14">
      <header className="relative overflow-hidden rounded-3xl border border-stone-300 bg-stone-100 px-5 py-7 dark:border-stone-700 dark:bg-stone-900 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="absolute -right-4 -top-5 h-28 w-28 rotate-12 rounded-3xl border-2 border-red-900/15 dark:border-red-600/20" />
        <div className="relative flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-red-900 dark:text-red-500">
              Chronicle · Lesson {String(lesson.order).padStart(2, '0')}
            </p>
            <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-50 sm:text-4xl">
              {lesson.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
              {lesson.sourceChapterStart} — {lesson.sourceChapterEnd} · {lesson.lessonWords.length} 个目标词
            </p>
          </div>
          <div aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center border-2 border-red-900/60 font-serif text-xs font-bold leading-tight text-red-900/75 dark:border-red-700 dark:text-red-400">
            第{lesson.order}<br />篇
          </div>
        </div>
      </header>

      <div className="sticky top-2 z-20 mt-4 shadow-lg shadow-stone-950/10">
        <StoryStepNav
          currentStep={activeStep}
          completedStep={savedProgress.completedStep}
          onSelect={setActiveStep}
        />
      </div>

      <section aria-labelledby={`step-${activeStep}-title`} className="mt-7">
        <div className="mb-6 border-b border-stone-300 pb-4 dark:border-stone-700">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
            First passage
          </p>
          <h2 id={`step-${activeStep}-title`} className="mt-1 font-serif text-2xl font-bold text-stone-950 dark:text-stone-50">
            {stepHeading[activeStep]}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{stepDescription[activeStep]}</p>
        </div>

        {activeStep === 1 ? <StoryReader paragraphs={lesson.content.paragraphs} mode="learn" /> : null}
        {activeStep === 2 ? (
          <StoryRecall paragraphs={lesson.content.paragraphs} lessonWords={lesson.lessonWords} onRate={handleRate} />
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
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="输入单词、词义或用法"
                  className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-700/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
                按场景筛选
                <select
                  value={scene}
                  onChange={(event) => setScene(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-base text-stone-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                >
                  <option value="">全部场景</option>
                  {scenes.map((sceneTitle) => <option key={sceneTitle} value={sceneTitle}>{sceneTitle}</option>)}
                </select>
              </label>
            </div>
            <StoryWordList lessonWords={wordLedger} query={query} scene={scene} />
          </div>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 border-t border-stone-300 pt-6 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
        {!firstPassComplete ? (
          <button
            type="button"
            disabled={savingStep !== null}
            onClick={() => revisitingCompletedStep ? setActiveStep(nextUnlockedStep) : completeStep(activeStep)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-red-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-red-800 dark:hover:bg-red-700 dark:focus-visible:ring-offset-stone-950"
          >
            {revisitingCompletedStep
              ? `返回第${nextUnlockedStep === 2 ? '二' : '三'}步`
              : savingStep === activeStep
                ? '正在保存…'
                : activeStep === 1
                  ? '完成第一步，进入回忆'
                  : activeStep === 2
                    ? '完成第二步，查看词册'
                    : '完成第三步'}
          </button>
        ) : (
          <div className="w-full rounded-2xl border border-emerald-700/30 bg-emerald-50 p-5 dark:border-emerald-700/50 dark:bg-emerald-950/30">
            <p className="font-serif text-xl font-bold text-emerald-950 dark:text-emerald-100">首次学习已经归卷</p>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80 dark:text-emerald-200/80">
              Step4 不会阻塞下一篇；到期强化可稍后分轮完成。
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href={nextLessonId ? `/story/${nextLessonId}` : '/story'}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 dark:bg-emerald-700 dark:hover:bg-emerald-600 dark:focus-visible:ring-offset-stone-950"
              >
                {nextLessonId ? '进入下一篇' : '返回课程卷宗'}
              </Link>
              <Link
                href="#step-4"
                onClick={() => {
                  if (!reviewQueueLoaded && !reviewQueueLoading) void loadReviewQueue()
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-800/30 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
              >
                {currentDueWords > 0 ? `查看 ${currentDueWords} 个到期强化词` : '查看 Step4 强化说明'}
              </Link>
            </div>
          </div>
        )}
        {!firstPassComplete ? (
          <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">进度按顺序保存，未完成的后一步保持锁定。</p>
        ) : null}
      </div>

      <section id="step-4" aria-labelledby="step-4-title" className="mt-8 scroll-mt-28 rounded-2xl border border-dashed border-amber-700/40 bg-amber-50/70 p-5 dark:border-amber-700/50 dark:bg-amber-950/20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-400">Later reinforcement</p>
        <h2 id="step-4-title" className="mt-1 font-serif text-xl font-bold text-stone-900 dark:text-stone-100">Step4 · 到期强化</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
          {currentDueWords > 0
            ? `本篇当前有 ${currentDueWords} 个词到期。强化按到期时间逐轮进行，不要求现在一次做完。`
            : '本篇当前没有到期词。强化会在未来按计划出现，不影响继续故事。'}
        </p>

        {!firstPassComplete ? (
          <p className="mt-4 rounded-xl border border-stone-300 bg-white/70 px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-950/40 dark:text-stone-300">
            完成 Step3 后可开始到期强化；下一篇仍会立即解锁。
          </p>
        ) : (
          <div className="mt-5">
            {reviewQueueError ? (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                {reviewQueueError}
              </p>
            ) : null}
            {!reviewQueueLoaded ? (
              <button
                type="button"
                disabled={reviewQueueLoading}
                onClick={() => void loadReviewQueue()}
                className="mb-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-800/40 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition enabled:hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60 dark:border-amber-700 dark:bg-stone-950 dark:text-amber-100 dark:enabled:hover:bg-amber-950"
              >
                {reviewQueueLoading ? '正在载入到期词…' : '载入到期强化词'}
              </button>
            ) : null}
            <StoryReviewTable words={reviewWords} attempts={noReviewAttempts} onSubmit={submitReview} />
          </div>
        )}
      </section>
    </article>
  )
}
