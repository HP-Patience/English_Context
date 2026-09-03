import Link from 'next/link'

import type { StoryReference } from '@/lib/story-references'

type StoryReferencesProps = {
  readonly references: readonly StoryReference[]
}

export function StoryReferences({ references }: StoryReferencesProps) {
  if (references.length === 0) return null

  return (
    <section aria-labelledby="story-references" className="story-theme mb-6">
      <div className="mb-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-800 dark:text-red-400">Story references</p>
        <h2 id="story-references" className="mt-1 font-serif text-2xl font-bold text-stone-950 dark:text-stone-50">故事中的出现位置</h2>
      </div>
      <ol className="space-y-3">
        {references.map((reference) => (
          <li key={`${reference.lessonId}-${reference.paragraphIndex}-${reference.wordOrder}`}>
            <Link
              href={`/story/${reference.lessonId}/cards/${reference.paragraphIndex}`}
              className="group block rounded-2xl border p-4 shadow-sm transition hover:border-red-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 dark:shadow-none dark:hover:border-red-700/60 dark:focus-visible:ring-offset-stone-950 sm:p-5"
              style={{ backgroundColor: 'var(--story-surface)', borderColor: 'var(--story-line)', color: 'var(--story-ink)' }}
            >
              <span className="text-xs font-medium tabular-nums text-stone-500 dark:text-stone-400">第 {reference.lessonOrder} 篇 · {reference.lessonTitle}</span>
              <span className="mt-2 block font-serif text-lg font-semibold text-stone-900 group-hover:text-red-800 dark:text-stone-100 dark:group-hover:text-red-400">{reference.sceneTitle}</span>
              <span className="story-muted mt-1 block text-xs">前往故事段落</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
