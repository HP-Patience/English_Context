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

export default function InterestsPage() {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/interests')
      .then((r) => r.json())
      .then((data) => {
        if (data.interests?.length > 0) {
          setSelected(data.interests.map((i: any) => i.topic))
        }
      })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/interests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interests: selected.map((t) => ({ topic: t, weight: 1 })) }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-bold">兴趣设置</h1>
      <p className="mb-6 text-sm text-stone-500">
        选择你的兴趣领域，AI 将生成贴合这些领域的例句
      </p>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {INTEREST_OPTIONS.map((opt) => (
          <button
            key={opt.topic}
            onClick={() =>
              setSelected((prev) =>
                prev.includes(opt.topic) ? prev.filter((t) => t !== opt.topic) : [...prev, opt.topic]
              )
            }
            className={`rounded-xl border-2 p-3 text-center transition ${
              selected.includes(opt.topic)
                ? 'border-stone-900 bg-stone-900 text-white'
                : 'border-stone-200 bg-white hover:border-stone-400'
            }`}
          >
            <div className="text-2xl">{opt.emoji}</div>
            <div className="mt-1 text-xs font-medium">{opt.label}</div>
          </button>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
      </button>
    </div>
  )
}
