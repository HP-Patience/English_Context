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
    <span className="story-target mx-0.5 inline-flex flex-wrap items-baseline gap-1 rounded-md px-1 py-0.5 font-semibold leading-6">
      <span lang="en">{segment.word}</span>
      {mode === 'learn' ? (
        <span className="story-target-gloss font-sans text-xs font-medium">
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
          className="story-scene relative border-l-2 pl-5 sm:pl-7"
        >
          <div aria-hidden="true" className="story-scene-dot absolute -left-[0.43rem] top-1.5 h-3 w-3 rounded-full border-2" />
          <h3
            id={`story-scene-${paragraphIndex}`}
            className="font-serif text-lg font-semibold tracking-wide"
          >
            {paragraph.sceneTitle}
          </h3>
          <p className="mt-3 text-[1.02rem] leading-9 sm:text-[1.08rem]">
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
