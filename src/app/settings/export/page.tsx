'use client'

import { useState, useEffect } from 'react'
import Loading from '@/components/Loading'
import { getStage, STAGE_ORDER } from '@/lib/stages'

type GroupInfo = { id: string; name: string; total: number; learned: number }
type ExportWord = { word: string; meanings: Array<{ pos: string; definitionCn: string | null; example: string | null }> }
type ExportGroup = { id: string; name: string; words: ExportWord[] }

export default function ExportPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportData, setExportData] = useState<ExportGroup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  // Group by stage
  const stageMap = new Map<string, { stage: string; groups: GroupInfo[] }>()
  for (const g of groups) {
    const stage = getStage(g.name)
    if (!stageMap.has(stage)) {
      stageMap.set(stage, { stage, groups: [] })
    }
    stageMap.get(stage)!.groups.push(g)
  }
  const stageEntries = STAGE_ORDER
    .map(s => stageMap.get(s))
    .filter(Boolean)
    .map(e => e!)
  // "其他" at the end
  const other = stageMap.get('其他')
  if (other) stageEntries.push(other)

  function toggleGroup(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleStage(stage: string) {
    const sg = stageMap.get(stage)
    if (!sg) return
    const gids = sg.groups.map(g => g.id)
    const allSelected = gids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of gids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  function isStageFullySelected(stage: string): boolean {
    const sg = stageMap.get(stage)
    return sg ? sg.groups.every(g => selected.has(g.id)) : false
  }

  function isStagePartiallySelected(stage: string): boolean {
    const sg = stageMap.get(stage)
    if (!sg || sg.groups.length === 0) return false
    const any = sg.groups.some(g => selected.has(g.id))
    return any && !isStageFullySelected(stage)
  }

  function toggleExpanded(stage: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
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

  function handlePrint() { window.print() }

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
    return <Loading />
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-bold text-stone-900 dark:text-stone-100">导出词表</h1>
      <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">按频率分类选择词表，预览后打印或导出 JSON。</p>

      {/* 选择面板 — 打印时隐藏 */}
      <div className="print:hidden mb-6 space-y-2">
        {stageEntries.map(entry => {
          const gids = entry.groups.map(g => g.id)
          const fullySelected = gids.every(id => selected.has(id))
          const partiallySelected = gids.some(id => selected.has(id))
          const isOpen = expanded.has(entry.stage)

          return (
            <div key={entry.stage} className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
              {/* 分类标题行 */}
              <div className="flex items-center gap-2 px-4 py-3">
                <input
                  type="checkbox"
                  checked={fullySelected}
                  ref={el => { if (el) el.indeterminate = partiallySelected && !fullySelected }}
                  onChange={() => toggleStage(entry.stage)}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500 dark:border-stone-600"
                />
                <button
                  onClick={() => toggleExpanded(entry.stage)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">{entry.stage}</span>
                  <span className="text-xs text-stone-400">
                    ({selected.size > 0 ? gids.filter(id => selected.has(id)).length : 0}/{gids.length})
                  </span>
                  <svg
                    className={`ml-auto h-4 w-4 text-stone-400 transition ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>

              {/* 词组列表 */}
              {isOpen && (
                <div className="border-t border-stone-100 px-4 py-2 dark:border-stone-700">
                  {entry.groups.map(g => (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(g.id)}
                        onChange={() => toggleGroup(g.id)}
                        className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500 dark:border-stone-600"
                      />
                      <span className="flex-1 text-sm text-stone-700 dark:text-stone-300">{g.name}</span>
                      <span className="text-xs text-stone-400">{g.learned}/{g.total}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={handlePreview}
          disabled={selected.size === 0 || fetching}
          className="mt-4 w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {fetching ? '加载中...' : `预览词表 (${selected.size} 组)`}
        </button>
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
            <div key={group.id}>
              <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-200">{group.name}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.words.map(w => (
                  <div key={w.word} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{w.word}</div>
                    {w.meanings.map((m, i) => (
                      <div key={i} className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="italic">{m.pos}</span> {m.definitionCn}
                        {m.example && <span className="mt-0.5 block text-stone-400 dark:text-stone-500">— {m.example}</span>}
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
          选择词组后点击"预览词表"
        </div>
      )}
    </div>
  )
}
