'use client'

import { useState, useEffect } from 'react'

const INTEREST_OPTIONS = [
  { emoji: '💻', label: '科技', topic: 'Technology' },
  { emoji: '🏥', label: '医学', topic: 'Medicine' },
  { emoji: '📈', label: '商务', topic: 'Business' },
  { emoji: '🎮', label: '游戏', topic: 'Gaming' },
  { emoji: '🎵', label: '音乐', topic: 'Music' },
  { emoji: '⚽', label: '体育', topic: 'Sports' },
  { emoji: '🍳', label: '美食', topic: 'Cooking' },
  { emoji: '🎬', label: '影视', topic: 'Movies' },
  { emoji: '📚', label: '读书', topic: 'Reading' },
  { emoji: '🌍', label: '旅行', topic: 'Travel' },
  { emoji: '🎨', label: '艺术', topic: 'Art' },
  { emoji: '🔬', label: '科学', topic: 'Science' },
]

export default function PreferencesPage() {
  const [selected, setSelected] = useState<string[]>([])
  const [dailyTarget, setDailyTarget] = useState(30)
  const [interestsSaved, setInterestsSaved] = useState(false)
  const [goalSaved, setGoalSaved] = useState(false)
  const [savingInterests, setSavingInterests] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)

  useEffect(() => {
    fetch('/api/interests')
      .then(r => r.json())
      .then(data => {
        if (data.interests?.length > 0) {
          setSelected(data.interests.map((i: any) => i.topic))
        }
      })
      .catch(() => {})
    fetch('/api/daily-goal')
      .then(r => r.json())
      .then(data => {
        if (data.target) setDailyTarget(data.target)
      })
      .catch(() => {})
  }, [])

  async function saveInterests() {
    setSavingInterests(true)
    try {
      await fetch('/api/interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: selected.map(t => ({ topic: t, weight: 1 })) }),
      })
      setInterestsSaved(true)
      setTimeout(() => setInterestsSaved(false), 2000)
    } finally {
      setSavingInterests(false)
    }
  }

  async function saveGoal() {
    setSavingGoal(true)
    try {
      const res = await fetch('/api/daily-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: dailyTarget }),
      })
      if (!res.ok) throw new Error('Save failed')
      setGoalSaved(true)
      setTimeout(() => setGoalSaved(false), 2000)
    } finally {
      setSavingGoal(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-stone-900 dark:text-stone-100">学习偏好</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">设定每日学习目标和兴趣领域。</p>
      </div>

      {/* Daily goal */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">每日目标</h2>
        <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">完成打卡记录连续天数。</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={500}
            value={dailyTarget}
            onChange={e => setDailyTarget(parseInt(e.target.value) || 1)}
            className="w-24 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          />
          <span className="text-sm text-stone-500 dark:text-stone-400">词/天</span>
          <button
            onClick={saveGoal}
            disabled={savingGoal}
            className="ml-auto rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {savingGoal ? '保存中...' : goalSaved ? '✓ 已保存' : '保存'}
          </button>
        </div>
      </section>

      {/* Interests */}
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">兴趣领域</h2>
        <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">AI 将生成贴合这些领域的例句。</p>
        <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {INTEREST_OPTIONS.map(opt => (
            <button
              key={opt.topic}
              onClick={() =>
                setSelected(prev =>
                  prev.includes(opt.topic) ? prev.filter(t => t !== opt.topic) : [...prev, opt.topic]
                )
              }
              className={`rounded-xl border-2 p-3 text-center transition ${
                selected.includes(opt.topic)
                  ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                  : 'border-stone-200 bg-white hover:border-stone-400 dark:border-stone-600 dark:bg-transparent dark:hover:border-stone-400'
              }`}
            >
              <div className="text-2xl">{opt.emoji}</div>
              <div className="mt-1 text-xs font-medium">{opt.label}</div>
            </button>
          ))}
        </div>
        <button
          onClick={saveInterests}
          disabled={savingInterests}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {savingInterests ? '保存中...' : interestsSaved ? '✓ 已保存' : '保存兴趣设置'}
        </button>
      </section>
    </div>
  )
}
