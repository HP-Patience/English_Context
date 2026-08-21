import type { StoryLessonParagraph, TargetWordSegment } from '@/lib/story-types'

type StoryReaderProps = {
  paragraphs: StoryLessonParagraph[]
  mode: 'learn' | 'recall'
}

type StoryTargetProps = {
  segment: TargetWordSegment
  mode: StoryReaderProps['mode']
}

function StoryTarget({ segment, mode }: StoryTargetProps) {
  return (
    <span className="mx-0.5 inline-flex flex-wrap items-baseline gap-1 rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-950 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900">
      <span lang="en">{segment.word}</span>
      {mode === 'learn' ? (
        <span className="font-sans text-xs font-medium text-red-800 dark:text-red-300">
          （<span>{segment.definitionCn}</span>）
        </span>
      ) : null}
    </span>
  )
}

export function StoryReader({ paragraphs, mode }: StoryReaderProps) {
  return (
    <div className="space-y-8">
      {paragraphs.map((paragraph, paragraphIndex) => (
        <section
          key={`${paragraph.sceneTitle}-${paragraphIndex}`}
          aria-labelledby={`story-scene-${paragraphIndex}`}
          className="relative border-l-2 border-stone-300 pl-5 dark:border-stone-700 sm:pl-7"
        >
          <div aria-hidden="true" className="absolute -left-[0.43rem] top-1.5 h-3 w-3 rounded-full border-2 border-stone-50 bg-red-800 dark:border-stone-950 dark:bg-red-600" />
          <h3
            id={`story-scene-${paragraphIndex}`}
            className="font-serif text-lg font-semibold tracking-wide text-stone-900 dark:text-stone-100"
          >
            {paragraph.sceneTitle}
          </h3>
          <p className="mt-3 text-[1.02rem] leading-9 text-stone-700 dark:text-stone-200 sm:text-[1.08rem]">
            {paragraph.segments.map((segment, segmentIndex) => (
              segment.type === 'text'
                ? <span key={segmentIndex}>{segment.value}</span>
                : <StoryTarget key={`${segment.wordOrder}-${segmentIndex}`} segment={segment} mode={mode} />
            ))}
          </p>
        </section>
      ))}
    </div>
  )
}
