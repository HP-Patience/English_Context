'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { StoryParagraphCard } from './StoryParagraphCard'

type StoryCardDetailProps = {
  readonly lessonId: string
  readonly lessonOrder: number
  readonly lessonTitle: string
  readonly paragraph: StoryLessonParagraph
  readonly paragraphIndex: number
  readonly lessonWords: readonly StoryLessonWordDto[]
  readonly completedCards: number
  readonly totalCards: number
  readonly initiallyBookmarked: boolean
}

export function StoryCardDetail({
  lessonId,
  lessonOrder,
  lessonTitle,
  paragraph,
  paragraphIndex,
  lessonWords,
  completedCards,
  totalCards,
  initiallyBookmarked,
}: StoryCardDetailProps) {
  const [completionDelta, setCompletionDelta] = useState(0)
  const [bookmarked, setBookmarked] = useState(initiallyBookmarked)
  const sharedCompletedCards = Math.min(totalCards, Math.max(0, completedCards + completionDelta))

  return (
    <article className="story-theme mx-auto max-w-3xl pb-14">
      <header className="story-header rounded-3xl border px-5 py-7 sm:px-8 sm:py-9">
        <p className="story-kicker text-[0.68rem] font-semibold uppercase tracking-[0.28em]">
          Lesson {String(lessonOrder).padStart(2, '0')} · Card {String(paragraphIndex + 1).padStart(2, '0')}
        </p>
        <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">{paragraph.sceneTitle}</h1>
        <p className="story-muted mt-3 text-sm leading-6">{lessonTitle}</p>
        <Link
          href={`/story/${lessonId}`}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[var(--story-line)] bg-[var(--story-surface)] px-4 text-sm font-semibold text-[var(--story-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
        >
          <span aria-hidden="true" className="mr-2">←</span> 返回整篇故事
        </Link>
      </header>

      <section aria-labelledby="story-card-content-title" className="mt-6">
        <h2 id="story-card-content-title" className="sr-only">段落卡片</h2>
        <StoryParagraphCard
          lessonId={lessonId}
          paragraph={paragraph}
          paragraphIndex={paragraphIndex}
          lessonWords={lessonWords}
          mode="learn"
          completedCards={sharedCompletedCards}
          totalCards={totalCards}
          bookmarked={bookmarked}
          onBookmarkedChange={setBookmarked}
          onCompletionDelta={(delta) => setCompletionDelta((current) => current + delta)}
          detailLink={false}
        />
      </section>
    </article>
  )
}
