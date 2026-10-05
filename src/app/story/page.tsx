import type { Metadata } from 'next'
import Link from 'next/link'
import { FadeSwap } from '@/components/FadeSwap'
import { connection } from 'next/server'

import { StoryCourseList } from '@/components/story/StoryCourseList'
import { StoryCourseProgress } from '@/components/story/StoryCourseProgress'
import { getLocalUserId, prisma } from '@/lib/prisma'
import { listStoryLessons } from '@/lib/story-service'

export const metadata: Metadata = {
  title: '蛊界词途 — ContextVocab',
  description: '沿连续故事主线学习考研英语词汇。',
}

export default async function StoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  await connection()
  const userId = await getLocalUserId()
  const lessons = await listStoryLessons({ prisma, userId })
  const orderedLessons = [...lessons].sort((left, right) => left.order - right.order)
  const currentLessonId = orderedLessons.find((lesson) => lesson.isUnlocked && lesson.completedStep < 3)?.id ?? null
  const totalPages = Math.max(1, Math.ceil(orderedLessons.length / 10))
  const currentIndex = orderedLessons.findIndex((lesson) => lesson.id === currentLessonId)
  const defaultPage = currentIndex >= 0 ? Math.floor(currentIndex / 10) + 1 : 1
  const { page: requestedPage } = await searchParams
  const pageNumber = typeof requestedPage === 'string' && /^\d+$/.test(requestedPage)
    ? Number(requestedPage)
    : defaultPage
  const currentPage = Math.min(totalPages, Math.max(1, pageNumber))
  const visibleLessons = orderedLessons.slice((currentPage - 1) * 10, currentPage * 10)
  const paginationClass = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800'
  const firstPassed = orderedLessons.filter((lesson) => lesson.completedStep === 3).length
  const reinforcing = orderedLessons.filter((lesson) => lesson.status === 'first_passed' || lesson.status === 'reviewing').length
  const reinforced = orderedLessons.filter((lesson) => lesson.status === 'reinforced').length
  const dueCount = orderedLessons.reduce((total, lesson) => total + lesson.dueReviewCount, 0)

  return (
    <div className="story-theme mx-auto max-w-3xl pb-12">
      <div>
        <StoryCourseProgress
          total={orderedLessons.length}
          firstPassed={firstPassed}
          reinforcing={reinforcing}
          reinforced={reinforced}
          dueCount={dueCount}
        />
      </div>

      <section aria-labelledby="story-lessons-title" className="mt-4">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-stone-400 dark:text-stone-500">Ordered lessons</p>
            <h2 id="story-lessons-title" className="mt-1 font-serif text-lg font-semibold text-stone-900 dark:text-stone-100">
              连续篇章
            </h2>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">仅显示已就绪课程</p>
        </div>
        <FadeSwap transitionKey={currentPage}><StoryCourseList lessons={visibleLessons} currentLessonId={currentLessonId} /></FadeSwap>
        {totalPages > 1 && (
          <nav aria-label="故事分页" className="mt-4 flex items-center justify-center gap-3">
            {currentPage > 1 ? (
              <Link href={`/story?page=${currentPage - 1}#story-lessons-title`} className={paginationClass}>上一页</Link>
            ) : (
              <button type="button" disabled className={`${paginationClass} cursor-not-allowed opacity-40`}>上一页</button>
            )}
            <span className="text-sm tabular-nums text-stone-500 dark:text-stone-400">第 {currentPage} / {totalPages} 页</span>
            {currentPage < totalPages ? (
              <Link href={`/story?page=${currentPage + 1}#story-lessons-title`} className={paginationClass}>下一页</Link>
            ) : (
              <button type="button" disabled className={`${paginationClass} cursor-not-allowed opacity-40`}>下一页</button>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}
