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
    <details id="step-4" className="mt-6 scroll-mt-28 border-t border-[var(--story-line)] pt-4">
      <summary aria-label="展开或收起到期强化" className="cursor-pointer text-sm font-semibold text-[var(--story-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]">
        到期强化 · {state.dueCount} 个词
      </summary>
      <p className="mt-3 text-xs leading-5 text-[var(--story-muted)]">
        {state.dueCount > 0 ? `本篇当前有 ${state.dueCount} 个词到期。` : '本篇当前没有到期词。'}
      </p>

      {!state.firstPassComplete ? (
        <p className="mt-3 text-xs text-[var(--story-muted)]">
          完成第三步后可进行强化。
        </p>
      ) : (
        <div className="mt-4">
          {state.error ? (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{state.error}</p>
          ) : null}
          {!state.loaded ? (
            <button type="button" disabled={state.loading} onClick={onLoad} className="mb-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--story-line)] px-4 py-2 text-sm text-[var(--story-ink)] hover:border-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] disabled:cursor-wait disabled:opacity-60">
              {state.loading ? '正在载入到期词…' : '载入到期强化词'}
            </button>
          ) : null}
          <StoryReviewTable words={[...state.words]} attempts={[...state.attempts]} onSubmit={onSubmit} />
        </div>
      )}
    </details>
  )
}
