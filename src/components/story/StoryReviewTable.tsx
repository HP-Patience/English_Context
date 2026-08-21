'use client'

import { useMemo, useState } from 'react'

import type { StoryReviewState } from '@/lib/story-api-types'
import type { StoryReviewSubmissionResult } from '@/lib/story-review'
import { GlossReveal } from './GlossReveal'

export type StoryReviewRound = 1 | 2 | 3 | 4 | 5

export type StoryReviewTableWord = {
  lessonWordId: string
  word: string
  gloss: string
  phonetic?: string | null
  partOfSpeech?: string | null
  dueRound: StoryReviewRound | null
  roundCompleted: number
  nextReviewAt: string | null
  isDue: boolean
}

export type StoryReviewAttemptView = {
  lessonWordId: string
  round: StoryReviewRound
  result: StoryReviewSubmissionResult
}

export type StoryReviewSubmission = {
  lessonWordId: string
  round: StoryReviewRound
  result: StoryReviewSubmissionResult
}

type StoryReviewTableProps = {
  words: StoryReviewTableWord[]
  attempts: StoryReviewAttemptView[]
  onSubmit: (submission: StoryReviewSubmission) => Promise<StoryReviewState>
}

type RowOverride = Pick<StoryReviewState, 'roundCompleted' | 'nextReviewAt'> & {
  isDue: boolean
}

const rounds: StoryReviewRound[] = [1, 2, 3, 4, 5]
const results: Array<{ result: StoryReviewSubmissionResult; label: string }> = [
  { result: 'remembered', label: '记得' },
  { result: 'vague', label: '模糊' },
  { result: 'forgotten', label: '忘记' },
]
const resultLabel: Record<StoryReviewSubmissionResult, string> = {
  remembered: '记得',
  vague: '模糊',
  forgotten: '忘记',
}

function formatDueDate(value: string | null): string {
  if (!value) return '本篇已完成'
  return value.slice(0, 10)
}

export function StoryReviewTable({ words, attempts, onSubmit }: StoryReviewTableProps) {
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({})
  const [submittedAttempts, setSubmittedAttempts] = useState<StoryReviewAttemptView[]>([])
  const [submittingWordId, setSubmittingWordId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const attemptsByWordAndRound = useMemo(() => {
    const mapped = new Map<string, StoryReviewAttemptView>()
    for (const attempt of [...attempts, ...submittedAttempts]) {
      mapped.set(`${attempt.lessonWordId}:${attempt.round}`, attempt)
    }
    return mapped
  }, [attempts, submittedAttempts])

  async function submit(word: StoryReviewTableWord, result: StoryReviewSubmissionResult) {
    if (!word.isDue || word.dueRound === null || submittingWordId !== null) return

    const round = word.dueRound
    setSubmittingWordId(word.lessonWordId)
    setError(null)
    setStatus(null)

    try {
      const review = await onSubmit({ lessonWordId: word.lessonWordId, round, result })
      setRowOverrides((current) => ({
        ...current,
        [word.lessonWordId]: {
          roundCompleted: review.roundCompleted,
          nextReviewAt: review.nextReviewAt,
          isDue: false,
        },
      }))
      setSubmittedAttempts((current) => [
        ...current.filter((attempt) => !(attempt.lessonWordId === word.lessonWordId && attempt.round === review.round)),
        { lessonWordId: word.lessonWordId, round: review.round as StoryReviewRound, result: review.result },
      ])
      setStatus(`${word.word} 的第${review.round}轮复习已保存。`)
    } catch {
      setError(`未能保存 ${word.word} 的第${round}轮复习，请重试。`)
    } finally {
      setSubmittingWordId(null)
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {status ? <p role="status" className="sr-only">{status}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-950">
        <table className="min-w-[62rem] w-full border-collapse text-left text-sm" aria-label="Step4 五轮强化复习表">
          <thead className="bg-stone-100 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:bg-stone-900 dark:text-stone-300">
            <tr>
              <th scope="col" className="px-4 py-3">目标词</th>
              <th scope="col" className="px-4 py-3">释义</th>
              {rounds.map((round) => <th key={round} scope="col" className="px-3 py-3 text-center">第{round}轮</th>)}
              <th scope="col" className="px-4 py-3">下次到期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {words.map((originalWord) => {
              const override = rowOverrides[originalWord.lessonWordId]
              const word = override ? { ...originalWord, ...override } : originalWord
              const isSubmitting = submittingWordId === word.lessonWordId

              return (
                <tr key={word.lessonWordId} className="align-top">
                  <th scope="row" className="px-4 py-4 font-normal">
                    <span className="block font-serif text-lg font-bold text-stone-950 dark:text-stone-50" lang="en">{word.word}</span>
                    <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                      {[word.phonetic, word.partOfSpeech].filter(Boolean).join(' · ') || '词音信息暂无'}
                    </span>
                  </th>
                  <td className="px-4 py-4"><GlossReveal gloss={word.gloss} hidden /></td>
                  {rounds.map((round) => {
                    const attempt = attemptsByWordAndRound.get(`${word.lessonWordId}:${round}`)
                    const isCurrentDueRound = word.isDue && word.dueRound === round

                    return (
                      <td key={round} className="px-2 py-3 text-center" data-round={round}>
                        {attempt ? (
                          <span className="inline-flex min-h-9 items-center rounded-full bg-emerald-100 px-3 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                            {resultLabel[attempt.result]}
                          </span>
                        ) : isCurrentDueRound ? (
                          <div className="grid gap-1.5" aria-label={`${word.word} 第${round}轮评价`}>
                            {results.map((option) => (
                              <button
                                key={option.result}
                                type="button"
                                disabled={submittingWordId !== null}
                                onClick={() => void submit(word, option.result)}
                                aria-label={`${word.word} 第${round}轮：${option.label}`}
                                className="min-h-9 rounded-lg border border-amber-700/40 bg-amber-50 px-2 text-xs font-semibold text-amber-950 transition enabled:hover:border-amber-800 enabled:hover:bg-amber-100 disabled:cursor-wait disabled:opacity-50 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100"
                              >
                                {isSubmitting ? '保存中…' : option.label}
                              </button>
                            ))}
                          </div>
                        ) : round <= word.roundCompleted ? (
                          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">已完成</span>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-label={`${word.word} 第${round}轮未到期`}
                            className="min-h-9 rounded-lg border border-stone-200 px-2 text-xs text-stone-400 disabled:cursor-not-allowed dark:border-stone-800 dark:text-stone-600"
                          >
                            未到期
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-4 text-xs leading-5 text-stone-600 dark:text-stone-300">
                    {word.roundCompleted >= 5 ? '五轮已完成' : word.nextReviewAt ? (
                      <time dateTime={word.nextReviewAt}>{formatDueDate(word.nextReviewAt)}</time>
                    ) : word.isDue ? '现在到期' : '等待安排'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
