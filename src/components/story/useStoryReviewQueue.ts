'use client'

import { useCallback, useState } from 'react'

import { parseStoryReviewApiResponse } from '@/lib/story-api-types'
import type { StoryReviewQueueApiResponse } from '@/lib/story-api-types'
import type { StoryReviewSubmission } from './StoryReviewTable'
import type { StoryReviewAttemptView, StoryReviewRound, StoryReviewTableWord } from './StoryReviewTable'
import type { StoryLessonView } from './StoryLessonShell'

function toReviewRound(value: number): StoryReviewRound | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

function buildReviewWords(lesson: StoryLessonView): StoryReviewTableWord[] {
  const stateByLessonWordId = new Map(lesson.reviewState.words.map((word) => [word.lessonWordId, word]))
  return lesson.lessonWords.map((word) => {
    const persisted = stateByLessonWordId.get(word.id)
    return {
      lessonWordId: word.id,
      word: word.word.text,
      gloss: word.glossCn,
      phonetic: word.word.phonetic,
      partOfSpeech: word.meaning.partOfSpeech,
      dueRound: null,
      roundCompleted: persisted?.roundCompleted ?? 0,
      nextReviewAt: persisted?.nextReviewAt ?? null,
      isDue: false,
    }
  })
}

function buildReviewAttempts(lesson: StoryLessonView): StoryReviewAttemptView[] {
  return lesson.reviewState.attempts.flatMap((attempt) => {
    const round = toReviewRound(attempt.round)
    return round === null ? [] : [{ ...attempt, round }]
  })
}

export function useStoryReviewQueue(lesson: StoryLessonView, dueWords: number) {
  const [words, setWords] = useState<StoryReviewTableWord[]>(() => buildReviewWords(lesson))
  const [attempts] = useState<StoryReviewAttemptView[]>(() => buildReviewAttempts(lesson))
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dueCount, setDueCount] = useState(dueWords)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/story/review?lessonId=${encodeURIComponent(lesson.id)}`)
      if (!response.ok) throw new Error('review queue request failed')
      const payload = await response.json() as StoryReviewQueueApiResponse
      const lessonQueue = payload.lessons.find((group) => group.lessonId === lesson.id)
      const dueByLessonWordId = new Map((lessonQueue?.words ?? []).map((word) => [word.lessonWordId, word]))
      setWords((current) => current.map((word) => {
        const dueWord = dueByLessonWordId.get(word.lessonWordId)
        if (!dueWord) return { ...word, dueRound: null, isDue: false }
        const dueRound = toReviewRound(dueWord.dueRound)
        const actionable = dueRound !== null && dueRound === word.roundCompleted + 1
        return { ...word, dueRound: actionable ? dueRound : null, isDue: actionable }
      }))
      setDueCount(lessonQueue?.dueCount ?? 0)
      setLoaded(true)
    } catch {
      setError('到期强化列表未能载入。现有学习进度未改变，请重试。')
    } finally {
      setLoading(false)
    }
  }, [lesson.id])

  async function submit(submission: StoryReviewSubmission) {
    const currentWord = words.find((word) => word.lessonWordId === submission.lessonWordId)
    if (!currentWord?.isDue || currentWord.dueRound === null || submission.round !== currentWord.dueRound) {
      throw new Error('review row is not actionable')
    }
    const submittedAt = new Date()
    const response = await fetch('/api/story/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submission),
    })
    if (!response.ok) throw new Error('review request failed')
    const review = parseStoryReviewApiResponse(await response.json(), { ...submission, submittedAt })
    if (!review) throw new Error('invalid review response')
    setWords((current) => current.map((word) => word.lessonWordId === review.lessonWordId
      ? { ...word, dueRound: null, roundCompleted: review.roundCompleted, nextReviewAt: review.nextReviewAt, isDue: false }
      : word))
    setDueCount((current) => Math.max(0, current - 1))
    return review
  }

  return { words, attempts, loaded, loading, error, dueCount, load, submit }
}
