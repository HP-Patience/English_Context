'use client'

import { useState } from 'react'

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

export default function ManualPage() {
  const [step, setStep] = useState<'word' | 'done'>('word')
  const [word, setWord] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function addWord() {
    if (!word.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), interests: [] }),
      })
      if (res.status === 409) {
        setResult({ error: '这个词已经添加过了' })
        setLoading(false)
        return
      }
      const data = await res.json()
      setResult(data)
      setStep('done')
    } catch {
      setResult({ error: '添加失败，请重试' })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'word') {
    return (
      <div className="mx-auto max-w-lg pt-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">手动加词</h1>
        <p className="mb-8 text-sm text-stone-500">
          输入不在考研词库中的单词，AI 生成例句
        </p>
        <form onSubmit={(e) => { e.preventDefault(); addWord() }} className="flex gap-2">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="输入英语单词..."
            className="flex-1 rounded-lg border border-stone-300 px-4 py-3 text-lg focus:border-stone-900 focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !word.trim()}
            className="rounded-lg bg-stone-900 px-6 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? '生成中...' : '学习'}
          </button>
        </form>
        {result?.error && <p className="mt-4 text-sm text-red-500">{result.error}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg pt-8 text-center">
      <h2 className="mb-4 text-2xl font-bold">单词已添加</h2>
      <p className="mb-2 text-stone-600">
        <strong>{word}</strong> 正在生成例句...
      </p>
      <p className="mb-8 text-sm text-stone-400">稍后返回查看</p>
      <div className="flex justify-center gap-4">
        <button onClick={() => { setStep('word'); setWord(''); setResult(null) }} className="rounded-lg bg-stone-900 px-6 py-2.5 font-medium text-white hover:bg-stone-800">
          再学一个
        </button>
        <button onClick={() => window.location.href = '/'} className="rounded-lg border border-stone-300 px-6 py-2.5 font-medium text-stone-700 hover:bg-stone-100">
          返回首页
        </button>
      </div>
    </div>
  )
}
