'use client'

import Link from 'next/link'
import type { FirstPassView } from './StoryFirstPassPanel'

type StoryQuickNavProps = {
  currentStep: FirstPassView
  onSelect: (step: FirstPassView) => void
  previousLessonId?: string | null
  nextLessonId?: string | null
}

const controlClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--story-line)] bg-[var(--story-bg)] text-[var(--story-ink)] transition hover:border-[var(--story-accent)] hover:text-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--story-line)] disabled:hover:text-[var(--story-ink)]'

// Iconify: lucide/arrow-left, lucide/arrow-right and lucide/list (ISC), bundled SVGs for offline/HTTP use.
function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={direction === 'left' ? 'm12 19l-7-7l7-7m7 7H5' : 'M5 12h14m-7-7l7 7l-7 7'} />
    </svg>
  )
}

export function StoryQuickNav({ currentStep, onSelect, previousLessonId, nextLessonId }: StoryQuickNavProps) {
  return (
    <details className="group fixed bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4 z-40 rounded-full border border-[var(--story-line)] bg-[var(--story-surface)] open:rounded-2xl open:p-2.5 sm:bottom-24 sm:right-6">
      <summary aria-label="展开或收起快捷导航" title="步骤 / 章节导航" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full bg-[var(--story-surface)] text-xs font-semibold text-[var(--story-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] group-open:h-9 group-open:w-full group-open:justify-between group-open:gap-6 group-open:rounded-lg group-open:bg-transparent group-open:px-1 group-open:text-[var(--story-muted)] [&::-webkit-details-marker]:hidden">
        <span className="hidden group-open:inline">快捷导航</span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="quick-nav-icon group-open:hidden"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" /></svg>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="quick-nav-icon hidden group-open:block"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6" /></svg>
      </summary>
      <nav aria-label="故事快捷导航" className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="mr-1 text-xs font-semibold text-[var(--story-muted)]">步骤</span>
        <button type="button" aria-label="上一步" disabled={currentStep === 1} onClick={() => onSelect((currentStep - 1) as FirstPassView)} className={controlClass}><Arrow direction="left" /></button>
        <button type="button" aria-label="下一步" disabled={currentStep === 3} onClick={() => onSelect((currentStep + 1) as FirstPassView)} className={controlClass}><Arrow direction="right" /></button>
      </div>
      <div className="flex items-center gap-2">
        <span className="mr-1 text-xs font-semibold text-[var(--story-muted)]">章节</span>
        {previousLessonId ? <Link aria-label="上一章" href={`/story/${encodeURIComponent(previousLessonId)}`} className={controlClass}><Arrow direction="left" /></Link> : <button type="button" aria-label="上一章" disabled className={controlClass}><Arrow direction="left" /></button>}
        {nextLessonId ? <Link aria-label="下一章" href={`/story/${encodeURIComponent(nextLessonId)}`} className={controlClass}><Arrow direction="right" /></Link> : <button type="button" aria-label="下一章" disabled className={controlClass}><Arrow direction="right" /></button>}
      </div>
      </nav>
    </details>
  )
}
