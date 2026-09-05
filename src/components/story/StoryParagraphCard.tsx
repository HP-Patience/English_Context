import Link from 'next/link'

import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { CompletionDateHistory } from './CompletionDateHistory'
import { StoryCardBookmarkButton } from './StoryCardBookmarkButton'
import { StoryTargetLink } from './StoryTargetLink'

type StoryParagraphCardProps = {
  readonly lessonId: string
  readonly paragraph: StoryLessonParagraph
  readonly paragraphIndex: number
  readonly lessonWords: readonly StoryLessonWordDto[]
  readonly mode: 'learn' | 'recall'
  readonly completedCards: number
  readonly totalCards: number
  readonly bookmarked: boolean
  readonly onBookmarkedChange: (bookmarked: boolean) => void
  readonly onCompletionDelta?: (delta: 1 | -1) => void
  readonly detailLink?: boolean
}

export function StoryParagraphCard({
  lessonId,
  paragraph,
  paragraphIndex,
  lessonWords,
  mode,
  completedCards,
  totalCards,
  bookmarked,
  onBookmarkedChange,
  onCompletionDelta,
  detailLink = true,
}: StoryParagraphCardProps) {
  const wordIdByOrder = new Map(lessonWords.map((lessonWord) => [lessonWord.sortOrder, lessonWord.word.id]))
  const headingId = `story-scene-${paragraphIndex}`
  const progressPercent = totalCards > 0 ? Math.min(100, Math.round((completedCards / totalCards) * 100)) : 0

  return (
    <article
      id={`story-paragraph-${paragraphIndex}`}
      aria-label={`故事段落 ${paragraphIndex + 1}：${paragraph.sceneTitle}`}
      className="story-scene relative scroll-mt-6 rounded-2xl border border-[var(--story-line)] bg-[var(--story-surface)] p-4 shadow-sm sm:p-5"
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--story-muted)]">
              Card {String(paragraphIndex + 1).padStart(2, '0')}
            </p>
            <StoryCardBookmarkButton
              lessonId={lessonId}
              paragraphIndex={paragraphIndex}
              bookmarked={bookmarked}
              onBookmarkedChange={onBookmarkedChange}
            />
          </div>
          <div className="max-w-full shrink-0 rounded-md bg-[var(--story-accent-soft)] px-2.5 py-1.5 text-[var(--story-ink)]">
            <p className="whitespace-nowrap text-center font-serif text-xs font-semibold tabular-nums">
              故事学习进度 {completedCards}/{totalCards}
            </p>
            {totalCards > 0 ? (
              <div
                role="progressbar"
                aria-label="段落完成进度"
                aria-valuemin={0}
                aria-valuemax={totalCards}
                aria-valuenow={completedCards}
                aria-valuetext={`已完成 ${completedCards} 段，共 ${totalCards} 段`}
                className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--story-line)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--story-accent)] transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            ) : <p role="status" className="sr-only">尚无段落进度</p>}
          </div>
        </div>
        <div className="relative mt-2 min-w-0 text-left">
          <h3 id={headingId} className="font-serif text-xl font-semibold tracking-wide sm:text-2xl">
            {detailLink ? (
              <Link
                href={`/story/${encodeURIComponent(lessonId)}/cards/${paragraphIndex}`}
                className="rounded-sm underline decoration-[var(--story-accent-line)] underline-offset-4 transition duration-200 hover:text-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
              >
                {paragraph.sceneTitle}
              </Link>
            ) : paragraph.sceneTitle}
          </h3>
        </div>
      </div>

      <div className="mt-4 -ml-3 border-l-2 border-[var(--story-accent)] pl-2.5">
        <p lang="zh-CN" className="text-pretty text-[1.02rem] leading-9 [word-break:auto-phrase] sm:text-[1.08rem]">
          {paragraph.segments.map((segment, segmentIndex) => (
            segment.type === 'text' ? <span key={segmentIndex}>{segment.value}</span> : (
              <StoryTargetLink
                key={`${segment.wordOrder}-${segmentIndex}`}
                word={segment.word}
                gloss={segment.definitionCn}
                wordId={wordIdByOrder.get(segment.wordOrder)}
                initiallyVisible={mode === 'learn'}
              />
            )
          ))}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <CompletionDateHistory
          endpoint={`/api/story/lessons/${encodeURIComponent(lessonId)}/paragraphs/${paragraphIndex}/completions?step=${mode === 'learn' ? 1 : 2}`}
          label={`第 ${paragraphIndex + 1} 段完成日期`}
          summaryLabel="本卡已学习"
          onCompletionDelta={onCompletionDelta}
          lazy
          manageable
        />
      </div>
    </article>
  )
}
