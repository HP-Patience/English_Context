type StoryCourseProgressProps = {
  total: number
  firstPassed: number
  reinforcing: number
  reinforced: number
  dueCount: number
}

export function StoryCourseProgress({
  total,
  firstPassed,
  reinforcing,
  reinforced,
  dueCount,
}: StoryCourseProgressProps) {
  const percent = total > 0 ? Math.min(100, Math.round((firstPassed / total) * 100)) : 0

  return (
    <section
      aria-labelledby="story-course-progress-title"
      className="overflow-hidden rounded-2xl border border-stone-300 bg-stone-950 text-stone-100 shadow-sm dark:border-stone-700"
    >
      <div className="border-b border-stone-800 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-stone-400">Course ledger</p>
            <h2 id="story-course-progress-title" className="mt-1 font-serif text-xl font-semibold">
              修习卷宗
            </h2>
          </div>
          <p className="font-serif text-2xl font-semibold tabular-nums text-stone-50">{firstPassed} / {total}</p>
        </div>
        {total > 0 ? (
          <div
            role="progressbar"
            aria-label="首次学习进度"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={firstPassed}
            aria-valuetext={`已完成 ${firstPassed} 篇，共 ${total} 篇`}
            className="mt-4 h-2 overflow-hidden rounded-full bg-stone-800"
          >
            <div className="h-full rounded-full bg-red-700 transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        ) : (
          <p role="status" aria-label="首次学习进度" className="mt-4 text-xs text-stone-400">
            尚无已就绪篇章，课程发布后将显示首次学习进度。
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 divide-x divide-stone-800">
        <div className="px-3 py-4 text-center sm:px-5">
          <dt className="text-[0.68rem] text-stone-400 sm:text-xs">强化中</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-stone-100 sm:text-lg">{reinforcing} 篇</dd>
        </div>
        <div className="px-3 py-4 text-center sm:px-5">
          <dt className="text-[0.68rem] text-stone-400 sm:text-xs">已强化</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-stone-100 sm:text-lg">{reinforced} 篇</dd>
        </div>
        <div className="px-3 py-4 text-center sm:px-5">
          <dt className="text-[0.68rem] text-stone-400 sm:text-xs">今日待复习</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-amber-300 sm:text-lg">{dueCount} 词</dd>
        </div>
      </dl>

      <p className="border-t border-stone-800 bg-stone-900 px-5 py-3 text-xs leading-5 text-stone-400 sm:px-6">
        Step4 会在之后按到期时间强化；完成前三步即可继续，<strong className="font-semibold text-stone-200">不会阻塞下一篇</strong>。
      </p>
    </section>
  )
}
