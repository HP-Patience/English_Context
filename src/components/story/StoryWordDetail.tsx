import type { StoryLessonWordListItem } from '@/lib/story-service'

export type StoryWordDisplay = StoryLessonWordListItem & {
  word: StoryLessonWordListItem['word'] & { phonetic?: string | null }
  phonetic?: string | null
  storyUsage?: string | null
}

type StoryWordDetailProps = {
  lessonWord: StoryWordDisplay
}

export function StoryWordDetail({ lessonWord }: StoryWordDetailProps) {
  const meaning = lessonWord.meaning.definitionCn || lessonWord.meaning.definition

  return (
    <article className="h-full rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-800 dark:text-red-400">
            No. {String(lessonWord.sortOrder).padStart(2, '0')}
          </p>
          <h4 className="mt-1 break-words font-serif text-2xl font-bold text-stone-950 dark:text-stone-50" lang="en">
            {lessonWord.word.text}
          </h4>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {lessonWord.meaning.partOfSpeech || '词性暂无'}
        </span>
      </div>

      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="text-xs font-medium text-stone-400 dark:text-stone-500">音标</dt>
          <dd className="mt-0.5 font-mono text-stone-600 dark:text-stone-300">
            {lessonWord.word.phonetic || lessonWord.phonetic || '音标暂无'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-400 dark:text-stone-500">释义</dt>
          <dd className="mt-0.5 font-medium text-stone-900 dark:text-stone-100">{meaning}</dd>
          {lessonWord.glossCn !== meaning ? (
            <dd className="mt-0.5 text-stone-600 dark:text-stone-300">本篇语境：{lessonWord.glossCn}</dd>
          ) : null}
        </div>
        {lessonWord.storyUsage ? (
          <div className="border-l-2 border-red-800/60 pl-3 dark:border-red-600/70">
            <dt className="text-xs font-medium text-stone-400 dark:text-stone-500">篇中用法</dt>
            <dd className="mt-1 text-stone-700 dark:text-stone-200">{lessonWord.storyUsage}</dd>
          </div>
        ) : null}
        {lessonWord.meaning.example ? (
          <div>
            <dt className="text-xs font-medium text-stone-400 dark:text-stone-500">例句</dt>
            <dd className="mt-0.5 text-stone-600 dark:text-stone-300" lang="en">{lessonWord.meaning.example}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  )
}
