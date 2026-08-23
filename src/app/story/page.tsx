import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

import { StoryCourseList } from '@/components/story/StoryCourseList'
import { StoryCourseProgress } from '@/components/story/StoryCourseProgress'
import { StoryGenerationProgressWidget } from '@/components/story/StoryGenerationProgressWidget'
import { getLocalUserId, prisma } from '@/lib/prisma'
import { listStoryLessons } from '@/lib/story-service'

export const metadata: Metadata = {
  title: '蛊界词途 — ContextVocab',
  description: '沿连续故事主线学习考研英语词汇。',
}

export default async function StoryPage() {
  await connection()
  const userId = await getLocalUserId()
  const lessons = await listStoryLessons({ prisma, userId })
  const orderedLessons = [...lessons].sort((left, right) => left.order - right.order)
  const currentLessonId = orderedLessons.find((lesson) => lesson.isUnlocked && lesson.completedStep < 3)?.id ?? null
  const firstPassed = orderedLessons.filter((lesson) => lesson.completedStep === 3).length
  const reinforcing = orderedLessons.filter((lesson) => lesson.status === 'first_passed' || lesson.status === 'reviewing').length
  const reinforced = orderedLessons.filter((lesson) => lesson.status === 'reinforced').length
  const dueCount = orderedLessons.reduce((total, lesson) => total + lesson.dueReviewCount, 0)

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <header className="relative overflow-hidden rounded-3xl border border-stone-300 bg-stone-100 px-5 py-8 dark:border-stone-700 dark:bg-stone-900 sm:px-8 sm:py-10">
        <div aria-hidden="true" className="absolute right-5 top-5 grid h-14 w-14 place-items-center border-2 border-red-900/60 font-serif text-xs font-bold leading-tight text-red-900/70 dark:border-red-700/70 dark:text-red-500/80">
          词<br />途
        </div>
        <div className="relative max-w-2xl pr-16">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-red-900 dark:text-red-500">
            The chronicle course
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-stone-950 dark:text-stone-50 sm:text-5xl">
            蛊界词途
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600 dark:text-stone-300 sm:text-base">
            沿故事时间线逐篇推进，在中文叙事中识记英文词。每篇先完成三步首次学习，再让强化复习按自己的节奏到来。
          </p>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/learn"
            className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            普通词卡学习
          </Link>
          <Link
            href="/review"
            className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 font-medium text-stone-600 transition hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            前往复习
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <StoryCourseProgress
          total={orderedLessons.length}
          firstPassed={firstPassed}
          reinforcing={reinforcing}
          reinforced={reinforced}
          dueCount={dueCount}
        />
      </div>

      <div className="mt-6">
        <StoryGenerationProgressWidget />
      </div>

      <section aria-labelledby="story-lessons-title" className="mt-9">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-stone-400 dark:text-stone-500">Ordered lessons</p>
            <h2 id="story-lessons-title" className="mt-1 font-serif text-2xl font-semibold text-stone-900 dark:text-stone-100">
              连续篇章
            </h2>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">仅显示已就绪课程</p>
        </div>
        <StoryCourseList lessons={orderedLessons} currentLessonId={currentLessonId} />
      </section>
    </div>
  )
}
