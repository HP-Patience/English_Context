'use client'

import { FormEvent, useState } from 'react'

type Quiz = { id: string; senderId: string; recipientId: string; completedAt: string | null; words: Array<{ wordId: string; word?: { text: string } }> }

export default function QuizPanel({ quizzes, recipientId, onRefresh }: { quizzes: Quiz[]; recipientId: string; onRefresh: () => void }) {
  const [wordIds, setWordIds] = useState('')
  const [error, setError] = useState('')
  async function create(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/interaction/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, wordIds: wordIds.split(',').map((value) => value.trim()).filter(Boolean) }) })
    if (!response.ok) { const data = await response.json().catch(() => null); setError(data?.error ?? '出题失败'); return }
    setWordIds(''); setError(''); onRefresh()
  }
  async function submit(quiz: Quiz) {
    const response = await fetch(`/api/interaction/quizzes/${quiz.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quiz.words.map((word) => ({ wordId: word.wordId, remembered: true }))) })
    if (!response.ok) setError('提交小测验失败'); else onRefresh()
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"><h2 className="text-lg font-semibold">互相出题</h2><p className="mt-1 text-xs text-stone-500">填写 1–10 个 Word ID；结果不会改变正式复习计划。</p><form onSubmit={create} className="mt-3 flex gap-2"><input aria-label="小测验单词 ID" required value={wordIds} onChange={(event) => setWordIds(event.target.value)} placeholder="word-id-1, word-id-2" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" /><button type="submit" className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white dark:bg-amber-500 dark:text-stone-950">发送</button></form>{error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}<div className="mt-3 space-y-2">{quizzes.map((quiz) => <div key={quiz.id} className="flex items-center justify-between rounded-lg bg-stone-50 p-2 text-sm dark:bg-stone-950"><span>{quiz.words.length} 个单词 · {quiz.completedAt ? '已完成' : '待完成'}</span>{quiz.recipientId === recipientId && !quiz.completedAt ? <button type="button" onClick={() => submit(quiz)} className="text-amber-700">完成</button> : null}</div>)}</div></section>
}
