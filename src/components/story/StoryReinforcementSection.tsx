import type { StoryReviewState } from '@/lib/story-api-types'
import { StoryReviewTable } from './StoryReviewTable'
import type { StoryReviewAttemptView, StoryReviewSubmission, StoryReviewTableWord } from './StoryReviewTable'

type ReinforcementState = {
  readonly firstPassComplete: boolean
  readonly dueCount: number
  readonly words: readonly StoryReviewTableWord[]
  readonly attempts: readonly StoryReviewAttemptView[]
  readonly loaded: boolean
  readonly loading: boolean
  readonly error: string | null
}

type StoryReinforcementSectionProps = {
  readonly state: ReinforcementState
  readonly onLoad: () => void
  readonly onSubmit: (submission: StoryReviewSubmission) => Promise<StoryReviewState>
}

export function StoryReinforcementSection({ state, onLoad, onSubmit }: StoryReinforcementSectionProps) {
  return (
    <section id="step-4" aria-labelledby="step-4-title" className="mt-8 scroll-mt-28 rounded-2xl border border-dashed border-amber-700/40 bg-amber-50/70 p-5 dark:border-amber-700/50 dark:bg-amber-950/20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-400">Later reinforcement</p>
      <h2 id="step-4-title" className="mt-1 font-serif text-xl font-bold text-stone-900 dark:text-stone-100">Step4 · 到期强化</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
        {state.dueCount > 0
          ? `本篇当前有 ${state.dueCount} 个词到期。强化按到期时间逐轮进行，不要求现在一次做完。`
          : '本篇当前没有到期词。强化会在未来按计划出现，不影响继续故事。'}
      </p>

      {!state.firstPassComplete ? (
        <p className="mt-4 rounded-xl border border-stone-300 bg-white/70 px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-950/40 dark:text-stone-300">
          完成 Step3 后可开始到期强化；下一篇仍会立即解锁。
        </p>
      ) : (
        <div className="mt-5">
          {state.error ? (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{state.error}</p>
          ) : null}
          {!state.loaded ? (
            <button type="button" disabled={state.loading} onClick={onLoad} className="mb-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-800/40 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition enabled:hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60 dark:border-amber-700 dark:bg-stone-950 dark:text-amber-100 dark:enabled:hover:bg-amber-950">
              {state.loading ? '正在载入到期词…' : '载入到期强化词'}
            </button>
          ) : null}
          <StoryReviewTable words={[...state.words]} attempts={[...state.attempts]} onSubmit={onSubmit} />
        </div>
      )}
    </section>
  )
}
