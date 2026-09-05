'use client'

import { useEffect, useMemo, useState } from 'react'

import type { StoryCompletionEvent } from '@/lib/story-completion'
import { parseCompletionHistory, parseSavedCompletion } from './completion-date-history-parsers'

type CompletionDateHistoryProps = {
  readonly endpoint: string
  readonly label: string
  readonly initialCount?: number
  readonly latestDate?: string | null
  readonly onFirstCompletion?: () => void
  readonly onCompletionDelta?: (delta: 1 | -1) => void
  readonly lazy?: boolean
  readonly manageable?: boolean
  readonly summaryLabel?: string
}

type PendingCompletion = { readonly completionId: string; readonly date: string }

const controlClass = 'min-h-9 rounded-lg border border-[var(--story-line)] bg-[var(--story-surface)] px-3 text-xs font-semibold text-[var(--story-ink)] transition hover:border-[var(--story-accent-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)] disabled:opacity-60'

export function CompletionDateHistory({
  endpoint,
  label,
  initialCount,
  latestDate = null,
  onFirstCompletion,
  onCompletionDelta,
  lazy = false,
  manageable = false,
  summaryLabel = '已学习',
}: CompletionDateHistoryProps) {
  const [completions, setCompletions] = useState<readonly StoryCompletionEvent[]>([])
  const [backfillDate, setBackfillDate] = useState('')
  const [editing, setEditing] = useState<{ readonly id: string; readonly date: string } | null>(null)
  const [pending, setPending] = useState<PendingCompletion | null>(null)
  const [undo, setUndo] = useState<StoryCompletionEvent | null>(null)
  const [expanded, setExpanded] = useState(!lazy)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    if (!expanded || historyLoaded) return
    let active = true
    setBusy(true)
    void fetch(endpoint)
      .then(async (response) => response.ok ? parseCompletionHistory(await response.json()) : null)
      .then((history) => {
        if (!active) return
        if (!history) setError(true)
        else setCompletions(sortCompletions(history))
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof TypeError || caught instanceof SyntaxError)) throw caught
        if (active) setError(true)
      })
      .finally(() => {
        if (active) {
          setBusy(false)
          setHistoryLoaded(true)
        }
      })
    return () => { active = false }
  }, [endpoint, expanded, historyLoaded])

  useEffect(() => {
    if (!undo) return
    const timeout = window.setTimeout(() => setUndo(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [undo])

  const visibleCount = !historyLoaded || error ? initialCount : completions.length
  const visibleLatestDate = !historyLoaded || error ? latestDate : completions[0]?.date ?? null
  const displayedCompletions = showAll ? completions : completions.slice(0, 3)
  const dateOrdinals = useMemo(() => duplicateDateOrdinals(completions), [completions])

  async function create(completion: PendingCompletion) {
    setBusy(true)
    setError(false)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completion),
      })
      const saved = response.ok ? parseSavedCompletion(await response.json()) : null
      if (!saved) return setError(true)
      const wasEmpty = completions.length === 0
      setCompletions((current) => sortCompletions([...current, saved]))
      setBackfillDate('')
      setPending(null)
      setUndo(null)
      if (wasEmpty) {
        onFirstCompletion?.()
        onCompletionDelta?.(1)
      }
    } catch (caught) {
      if (!(caught instanceof TypeError || caught instanceof SyntaxError)) throw caught
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function update() {
    if (!editing) return
    setBusy(true)
    setError(false)
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const saved = response.ok ? parseSavedCompletion(await response.json()) : null
      if (!saved) return setError(true)
      setCompletions((current) => sortCompletions(current.map((item) => item.id === saved.id ? saved : item)))
      setEditing(null)
    } catch (caught) {
      if (!(caught instanceof TypeError || caught instanceof SyntaxError)) throw caught
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(completion: StoryCompletionEvent) {
    setBusy(true)
    setError(false)
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: completion.id }),
      })
      if (!response.ok) return setError(true)
      const wasLast = completions.length === 1
      setCompletions((current) => current.filter((item) => item.id !== completion.id))
      setEditing(null)
      setUndo(completion)
      if (wasLast) onCompletionDelta?.(-1)
    } catch (caught) {
      if (!(caught instanceof TypeError || caught instanceof SyntaxError)) throw caught
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  function recordToday() {
    const completion = { completionId: createCompletionId(), date: localCalendarDate() }
    setPending(completion)
    void create(completion)
  }

  return (
    <section aria-label={`${label}历史`} className="rounded-xl border border-[var(--story-line)] bg-[var(--story-bg)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--story-muted)]">
          {manageable && expanded ? <span className="mr-2 text-[var(--story-ink)]">编辑学习记录</span> : null}
          {visibleCount === undefined ? '可独立记录完成日期' : <>{summaryLabel} <span className="tabular-nums text-[var(--story-ink)]">{visibleCount}</span> 次{visibleLatestDate ? <> · 最近 <time dateTime={visibleLatestDate}>{visibleLatestDate}</time></> : null}</>}
        </p>
        {!expanded ? <button type="button" aria-label={`记录或查看${label}历史`} onClick={() => setExpanded(true)} className={controlClass}>编辑学习记录</button> : null}
      </div>

      {expanded && historyLoaded ? (
        <div className="mt-3 space-y-3">
          {displayedCompletions.length > 0 ? (
            <ol className="space-y-2" aria-label="已保存日期">
              {displayedCompletions.map((completion) => (
                <li key={completion.id} className="flex flex-wrap items-center gap-2">
                  {editing?.id === completion.id ? (
                    <>
                      <input type="date" aria-label={`修改日期 ${completion.date}`} value={editing.date} onChange={(event) => setEditing({ id: completion.id, date: event.target.value })} className={`${controlClass} font-normal`} />
                      <button type="button" disabled={busy || !editing.date} onClick={() => void update()} className={controlClass}>保存</button>
                      <button type="button" disabled={busy} onClick={() => setEditing(null)} className={controlClass}>取消</button>
                    </>
                  ) : (
                    <>
                      <time dateTime={completion.date} className="min-w-28 text-sm tabular-nums text-[var(--story-ink)]">{completion.date}{dateOrdinals.get(completion.id) ? ` · 第 ${dateOrdinals.get(completion.id)} 次` : ''}</time>
                      {manageable ? <button type="button" disabled={busy || !online} onClick={() => setEditing({ id: completion.id, date: completion.date })} className={controlClass}>修改</button> : null}
                      {manageable ? <button type="button" disabled={busy || !online} onClick={() => void remove(completion)} className={`${controlClass} text-red-800 dark:text-red-300`}>删除</button> : null}
                    </>
                  )}
                </li>
              ))}
            </ol>
          ) : <p className="text-xs text-[var(--story-muted)]">还没有学习记录。</p>}

          {completions.length > 3 ? <button type="button" onClick={() => setShowAll((current) => !current)} className={controlClass}>{showAll ? '收起记录' : `查看全部 ${completions.length} 条`}</button> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !online} onClick={recordToday} className="min-h-10 rounded-lg bg-red-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-red-800">{busy ? '正在保存…' : '记录今天'}</button>
            <button type="button" disabled={busy || !online} onClick={() => setBackfillOpen((current) => !current)} className={controlClass}>{backfillOpen ? '收起补记' : '补记其他日期'}</button>
          </div>

          {backfillOpen ? <div className="flex flex-col gap-2 sm:flex-row">
            <input type="date" aria-label={label} value={backfillDate} onChange={(event) => setBackfillDate(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--story-line)] bg-[var(--story-surface)] px-3 text-base tabular-nums text-[var(--story-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]" />
            <button type="button" disabled={!backfillDate || busy || !online} onClick={() => {
              const completion = { completionId: createCompletionId(), date: backfillDate }
              setPending(completion)
              void create(completion)
            }} className={controlClass}>保存日期</button>
          </div> : null}
        </div>
      ) : expanded && busy ? <p role="status" className="mt-2 text-xs text-[var(--story-muted)]">正在载入学习记录…</p> : null}

      {undo ? <p role="status" className="mt-3 text-xs text-[var(--story-muted)]">已删除 {undo.date}。 <button type="button" disabled={busy || !online} onClick={() => void create({ completionId: undo.completionId, date: undo.date })} className="font-semibold text-[var(--story-accent)] underline">撤销</button></p> : null}
      {!online ? <p role="status" className="mt-2 text-xs text-amber-900 dark:text-amber-200">离线时不能修改学习记录。</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-900 dark:text-red-200">学习记录操作失败，请重试。{pending ? ' 所选日期已保留。' : ''}</p> : null}
    </section>
  )
}

function localCalendarDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createCompletionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sortCompletions(completions: readonly StoryCompletionEvent[]): readonly StoryCompletionEvent[] {
  return [...completions].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt))
}

function duplicateDateOrdinals(completions: readonly StoryCompletionEvent[]): ReadonlyMap<string, number> {
  const ordinals = new Map<string, number>()
  const dates = new Map<string, StoryCompletionEvent[]>()
  for (const completion of completions) dates.set(completion.date, [...(dates.get(completion.date) ?? []), completion])
  for (const sameDate of dates.values()) {
    if (sameDate.length < 2) continue
    sameDate.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).forEach((completion, index) => ordinals.set(completion.id, index + 1))
  }
  return ordinals
}
