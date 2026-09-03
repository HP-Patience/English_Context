import SelectionSearch from '@/components/SelectionSearch'
import SentenceTTSButton from '@/components/SentenceTTSButton'
import { highlightWord } from '@/lib/highlight'

import type { WordDetail } from './word-detail-types'

type WordLearningContentProps = {
  readonly word: WordDetail
}

export function WordLearningContent({ word }: WordLearningContentProps) {
  const hasSentences = word.meanings.some((meaning) => (meaning.userWordMeanings[0]?.sentences.length ?? 0) > 0)

  return (
    <>
      <section aria-labelledby="word-meanings" className="mb-6 space-y-4">
        <h2 id="word-meanings" className="text-sm font-medium text-stone-500 dark:text-stone-400">释义</h2>
        {word.meanings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 bg-white px-5 py-8 text-center text-sm text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:shadow-none">
            该单词的坏释义已清理，当前暂无可显示内容。
          </div>
        ) : word.meanings.map((meaning) => {
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
          {word.meanings.map((meaning) => {
            const sentences = meaning.userWordMeanings[0]?.sentences ?? []
            if (sentences.length === 0) return null
            return (
              <div key={meaning.id} className="space-y-2">
                {sentences.map((sentence, sentenceIndex) => (
                  <article key={`${sentence.sentenceText}-${sentenceIndex}`}>
                    <div className="mb-1 flex justify-end"><SentenceTTSButton text={sentence.sentenceText} /></div>
                    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
                      <SelectionSearch>
                        <p className="text-sm leading-relaxed text-stone-800 dark:text-stone-200" lang="en">
                          {highlightWord(sentence.sentenceText, word.text).map((part, partIndex) => part.highlight ? (
                            <span key={partIndex} className="font-semibold text-amber-700 underline decoration-amber-300 decoration-2 underline-offset-4 dark:text-amber-400">{part.text}</span>
                          ) : <span key={partIndex}>{part.text}</span>)}
                        </p>
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
