import SelectionSearch from '@/components/SelectionSearch'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import { highlightWord } from '@/lib/highlight'

import type { WordDetail, WordMeaning } from './word-detail-types'


function meaningKey(meaning: WordMeaning): string {
  return [
    meaning.partOfSpeech.trim().toLocaleLowerCase(),
    meaning.definition.trim().toLocaleLowerCase(),
    meaning.definitionCn?.trim().toLocaleLowerCase() ?? '',
  ].join('\u0000')
}

function mergeMeanings(meanings: readonly WordMeaning[]): WordMeaning[] {
  const merged = new Map<string, WordMeaning>()

  for (const meaning of meanings) {
    const key = meaningKey(meaning)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, meaning)
      continue
    }

    const progress = [...existing.userWordMeanings, ...meaning.userWordMeanings]
      .sort((left, right) => right.mastery - left.mastery || right.interval - left.interval)[0]
    const sentences = [...existing.userWordMeanings, ...meaning.userWordMeanings]
      .flatMap((item) => item.sentences)
      .filter((sentence, index, all) => all.findIndex((candidate) => (
        candidate.sentenceText === sentence.sentenceText
        && candidate.sentenceCn === sentence.sentenceCn
        && candidate.contextTopic === sentence.contextTopic
      )) === index)

    merged.set(key, {
      ...existing,
      userWordMeanings: progress
        ? [{ ...progress, sentences }]
        : [],
    })
  }

  return [...merged.values()]
}

type WordLearningContentProps = {
  readonly word: WordDetail
}

export function WordLearningContent({ word }: WordLearningContentProps) {
  const meanings = mergeMeanings(word.meanings)
  const hasSentences = meanings.some((meaning) => (meaning.userWordMeanings[0]?.sentences.length ?? 0) > 0)

  return (
    <>
      <section aria-labelledby="word-meanings" className="mb-6 space-y-4">
        <h2 id="word-meanings" className="text-sm font-medium text-stone-500 dark:text-stone-400">释义</h2>
        {word.meanings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 bg-white px-5 py-8 text-center text-sm text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none">
            该单词的坏释义已清理，当前暂无可显示内容。
          </div>
        ) : meanings.map((meaning) => {
          const progress = meaning.userWordMeanings[0]
          return (
            <article key={meaning.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
              <div className="mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{meaning.partOfSpeech}</span>
                {progress ? <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">掌握 {progress.mastery}% · 间隔 {progress.interval}天</span> : null}
              </div>
              <SelectionSearch><p className="text-base font-medium text-stone-900 dark:text-stone-100">{meaning.definition}</p></SelectionSearch>
              {meaning.definitionCn && meaning.definitionCn !== meaning.definition ? <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{meaning.definitionCn}</p> : null}
            </article>
          )
        })}
      </section>

      {hasSentences ? (
        <section aria-labelledby="word-sentences" className="mb-6 space-y-3">
          <h2 id="word-sentences" className="text-sm font-medium text-stone-500 dark:text-stone-400">例句与译文</h2>
          {meanings.map((meaning) => {
            const sentences = meaning.userWordMeanings[0]?.sentences ?? []
            if (sentences.length === 0) return null
            return (
              <div key={meaning.id} className="space-y-2">
                {sentences.map((sentence, sentenceIndex) => (
                  <article key={`${sentence.sentenceText}-${sentenceIndex}`}>
                    <div className="relative rounded-xl border border-stone-200 bg-white py-4 pl-10 pr-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
                      <SelectionSearch>
                        <div>
                          <span className="absolute left-1 top-4 inline-flex h-7 items-center"><SentenceTTSButton text={sentence.sentenceText} /></span>
                        <p className="min-w-0 flex-1 break-words text-sm leading-7 text-stone-800 dark:text-stone-200" lang="en">
                          {highlightWord(sentence.sentenceText, word.text).map((part, partIndex) => part.highlight ? (
                            <span key={partIndex} className="font-semibold text-amber-700 underline decoration-amber-300 decoration-2 underline-offset-4 dark:text-amber-400">{part.text}</span>
                          ) : <span key={partIndex}>{part.text}</span>)}
                        </p>
                        </div>
                      </SelectionSearch>
                      {sentence.sentenceCn ? <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400" lang="zh-CN">{sentence.sentenceCn}</p> : null}
                      {sentence.contextTopic ? <span className="mt-2 inline-block rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">{sentence.contextTopic}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            )
          })}
        </section>
      ) : null}
    </>
  )
}
