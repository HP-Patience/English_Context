'use client'

import { useState, useEffect } from 'react'
import './export.css'

type GroupInfo = { id: string; name: string; total: number; learned: number }
type ExportWord = { word: string; meanings: Array<{ pos: string; definitionCn: string | null; example: string | null }> }
type ExportGroup = { id: string; name: string; words: ExportWord[] }

export default function ExportPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportData, setExportData] = useState<ExportGroup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    fetch('/api/kaoyan/stats')
      .then(r => r.json())
      .then(data => {
        if (data.groups) {
          setGroups(data.groups)
          setSelected(new Set(data.groups.map((g: GroupInfo) => g.id)))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === groups.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(groups.map(g => g.id)))
    }
  }

  async function handlePreview() {
    if (selected.size === 0) return
    setFetching(true)
    try {
      const params = new URLSearchParams()
      selected.forEach(id => params.append('groupId', id))
      const res = await fetch(`/api/export?${params}`)
      const data = await res.json()
      setExportData(data.groups)
    } catch {
      alert('获取词表失败')
    } finally {
      setFetching(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleExportJSON() {
    if (!exportData) return
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), groups: exportData }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contextvocab-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">导出词表</h1>

      {/* 选词面板 — 打印时隐藏 */}
      <div className="print:hidden mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">选择词表范围</h2>
          <button
            onClick={toggleAll}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            {selected.size === groups.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="space-y-2">
          {groups.map(g => (
            <label key={g.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500 dark:border-stone-600"
              />
              <span className="flex-1 text-sm font-medium text-stone-700 dark:text-stone-300">{g.name}</span>
              <span className="text-xs text-stone-400">{g.learned}/{g.total}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handlePreview}
            disabled={selected.size === 0 || fetching}
            className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {fetching ? '加载中...' : `预览词表 (${selected.size} 组)`}
          </button>
        </div>
      </div>

      {/* 词表预览 */}
      {exportData && (
        <div className="space-y-8">
          <div className="print:hidden flex gap-2">
            <button onClick={handlePrint} className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">
              打印
            </button>
            <button onClick={handleExportJSON} className="flex-1 rounded-lg border border-stone-300 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800">
              导出 JSON
            </button>
          </div>

          {exportData.map(group => (
            <div key={group.id} className="export-group">
              <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-200">{group.name}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.words.map(w => (
                  <div key={w.word} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{w.word}</div>
                    {w.meanings.map((m, i) => (
                      <div key={i} className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="italic">{m.pos}</span> {m.definitionCn}
                        {m.example && <span className="block mt-0.5 text-stone-400 dark:text-stone-500">— {m.example}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!exportData && !loading && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          选择词表范围后点击"预览词表"
        </div>
      )}
    </div>
  )
}
