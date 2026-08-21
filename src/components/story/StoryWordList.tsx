import type { StoryLessonWordListItem } from '@/lib/story-service'
import { StoryWordDetail, type StoryWordDisplay } from './StoryWordDetail'

type StoryWordListProps = {
  lessonWords: Array<StoryLessonWordListItem | StoryWordDisplay>
  query: string
  scene: string
}

function searchableText(word: StoryLessonWordListItem | StoryWordDisplay) {
  return [
    word.word.text,
    word.glossCn,
    word.meaning.partOfSpeech,
    word.meaning.definition,
    word.meaning.definitionCn,
    word.meaning.example,
    word.sceneTitle,
  ].filter(Boolean).join(' ').toLocaleLowerCase()
}

export function StoryWordList({ lessonWords, query, scene }: StoryWordListProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const normalizedScene = scene.trim()
  const filteredWords = [...lessonWords]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((word) => !normalizedScene || word.sceneTitle === normalizedScene)
    .filter((word) => !normalizedQuery || searchableText(word).includes(normalizedQuery))

  const sceneOrder: string[] = []
  const wordsByScene = new Map<string, StoryWordDisplay[]>()
  for (const word of filteredWords) {
    const sceneTitle = word.sceneTitle || '未分场'
    if (!wordsByScene.has(sceneTitle)) {
      sceneOrder.push(sceneTitle)
      wordsByScene.set(sceneTitle, [])
    }
    wordsByScene.get(sceneTitle)?.push(word)
  }

  if (filteredWords.length === 0) {
    return (
      <p role="status" className="rounded-2xl border border-dashed border-stone-300 px-5 py-10 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
        没有符合当前筛选的目标词。
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {sceneOrder.map((sceneTitle, sceneIndex) => {
        const words = wordsByScene.get(sceneTitle) ?? []
        return (
          <section key={sceneTitle} role="region" aria-label={sceneTitle}>
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-900 font-serif text-sm font-bold text-stone-50 dark:bg-stone-100 dark:text-stone-950">
                {sceneIndex + 1}
              </span>
              <div>
                <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100">{sceneTitle}</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">{words.length} 个目标词</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {words.map((word) => <StoryWordDetail key={word.id} lessonWord={word} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
