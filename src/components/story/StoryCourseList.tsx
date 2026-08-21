import Link from 'next/link'

import type { StoryLessonListItem } from '@/lib/story-service'

type CourseLesson = StoryLessonListItem & {
  publicationStatus?: 'ready' | 'draft' | 'failed' | 'archived'
}

type StoryCourseListProps = {
  lessons: CourseLesson[]
  currentLessonId: string | null
}

const statusCopy: Record<StoryLessonListItem['status'], string> = {
  not_started: '首次学习未开始',
  learning: '首次学习进行中',
  first_passed: '首次学习已完成',
  reviewing: '强化复习进行中',
  reinforced: '五轮强化已完成',
}

function actionLabel(lesson: StoryLessonListItem, isCurrent: boolean) {
  if (isCurrent) return `继续第 ${lesson.currentStep} 步`
  if (lesson.completedStep === 0) return `开始第 ${lesson.order} 篇`
  if (lesson.completedStep < 3) return `继续第 ${lesson.currentStep} 步`
  return `查看第 ${lesson.order} 篇`
}

export function StoryCourseList({ lessons, currentLessonId }: StoryCourseListProps) {
  const readyLessons = lessons
    .filter((lesson) => lesson.publicationStatus === undefined || lesson.publicationStatus === 'ready')
    .sort((left, right) => left.order - right.order)

  if (readyLessons.length === 0) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-dashed border-stone-300 bg-stone-100/70 px-6 py-12 text-center dark:border-stone-700 dark:bg-stone-900/60"
      >
        <p className="font-serif text-xl font-semibold text-stone-800 dark:text-stone-200">故事课程尚未发布</p>
        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
          已完成的篇章会在校验后按故事顺序出现在这里。
        </p>
      </div>
    )
  }

  return (
    <ol className="space-y-4" aria-label="故事课程篇章">
      {readyLessons.map((lesson) => {
        const isCurrent = lesson.id === currentLessonId
        return (
          <li key={lesson.id}>
            <article
              aria-label={`第 ${lesson.order} 篇：${lesson.title}`}
              data-current={isCurrent ? 'true' : 'false'}
              className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-200 dark:bg-stone-900 dark:shadow-none ${
                isCurrent
                  ? 'border-red-800/50 ring-1 ring-red-800/15 dark:border-red-700/60 dark:ring-red-500/20'
                  : 'border-stone-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:border-stone-800 dark:hover:border-stone-700'
              }`}
            >
              <div className="grid sm:grid-cols-[5.25rem_minmax(0,1fr)]">
                <div
                  className={`flex items-center justify-between border-b px-4 py-3 sm:flex-col sm:justify-center sm:border-b-0 sm:border-r sm:px-3 sm:py-6 ${
                    isCurrent
                      ? 'border-red-800/20 bg-red-950 text-stone-50 dark:border-red-700/30 dark:bg-red-950/80'
                      : 'border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300'
                  }`}
                >
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] opacity-70">Chronicle</span>
                  <span className="font-serif text-2xl font-bold tabular-nums">{String(lesson.order).padStart(2, '0')}</span>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isCurrent && (
                          <span className="rounded-full bg-red-900 px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide text-red-50 dark:bg-red-800">
                            当前篇章
                          </span>
                        )}
                        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                          {statusCopy[lesson.status]}
                        </span>
                      </div>
                      <h3 className="mt-2 font-serif text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50 sm:text-2xl">
                        {lesson.title}
                      </h3>
                      <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
                        取材 {lesson.sourceChapterStart}—{lesson.sourceChapterEnd}
                      </p>
                    </div>

                    {lesson.isUnlocked ? (
                      <Link
                        href={`/story/${lesson.id}`}
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950 ${
                          isCurrent
                            ? 'bg-red-900 text-white shadow-sm hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700'
                            : 'border border-stone-300 bg-stone-50 text-stone-800 hover:border-stone-400 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800'
                        }`}
                      >
                        {actionLabel(lesson, isCurrent)}
                        <span aria-hidden="true" className="ml-2">→</span>
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-500">
                        完成上一篇第三步后解锁
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3 text-xs dark:border-stone-800">
                    <span className="rounded-md bg-stone-100 px-2.5 py-1.5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {lesson.targetWordCount} 个目标词
                    </span>
                    <span className="rounded-md bg-stone-100 px-2.5 py-1.5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      当前第 {lesson.currentStep} 步
                    </span>
                    <span className={`rounded-md px-2.5 py-1.5 ${
                      lesson.dueReviewCount > 0
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                        : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                    }`}>
                      {lesson.dueReviewCount > 0 ? `${lesson.dueReviewCount} 个待强化` : '暂无待强化'}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </li>
        )
      })}
    </ol>
  )
}
