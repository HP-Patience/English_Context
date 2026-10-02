'use client'

import { FormEvent, useState } from 'react'

type Challenge = { id: string; title: string; kind: string; target: number; value: number; endsAt: string }

export default function ChallengePanel({ challenge, admin, onRefresh }: { challenge: Challenge | null; admin: boolean; onRefresh: () => void }) {
  const [form, setForm] = useState({ title: '', kind: 'active_days', target: '5', startsAt: '', endsAt: '', participantId: '' })
  const [error, setError] = useState('')

  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/interaction/challenges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, target: Number(form.target), startsAt: `${form.startsAt || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`, endsAt: `${form.endsAt || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}T23:59:59.000Z` }),
    })
    if (!response.ok) { const data = await response.json().catch(() => null); setError(data?.error ?? '创建挑战失败'); return }
    setForm({ ...form, title: '' }); onRefresh()
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-lg font-semibold">共同挑战</h2>
      {challenge ? <p className="mt-3 text-sm">{challenge.title}：{challenge.value} / {challenge.target}，截止 {new Date(challenge.endsAt).toLocaleDateString('zh-CN')}</p> : <p className="mt-3 text-sm text-stone-500">暂无进行中的挑战。</p>}
      {admin && !challenge ? <form onSubmit={create} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input aria-label="挑战标题" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="挑战标题" className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <input aria-label="参与者账号 ID" required value={form.participantId} onChange={(event) => setForm({ ...form, participantId: event.target.value })} placeholder="朋友账号 ID" className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <select aria-label="挑战类型" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"><option value="active_days">学习天数</option><option value="learned_words">学习单词数</option><option value="story_completion">故事完成度</option></select>
        <input aria-label="挑战目标" required type="number" min="1" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <button type="submit" className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white dark:bg-amber-500 dark:text-stone-950 sm:col-span-2">创建挑战</button>
        {error ? <p role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      </form> : null}
    </section>
  )
}

