'use client'

import { useState } from 'react'

type GlossRevealProps = {
  gloss: string
  hidden: boolean
  onTogglePinned?: (pinned: boolean) => void
}

export function GlossReveal({ gloss, hidden, onTogglePinned }: GlossRevealProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  if (!hidden) {
    return <span lang="zh-CN">{gloss}</span>
  }

  const visible = isPinned || isHovered || isFocused

  function togglePinned() {
    const next = !isPinned
    setIsPinned(next)
    if (!next) {
      setIsHovered(false)
      setIsFocused(false)
    }
    onTogglePinned?.(next)
  }

  return (
    <button
      type="button"
      aria-expanded={visible}
      aria-pressed={isPinned}
      aria-label={isPinned ? '隐藏并取消固定释义' : '显示并固定释义'}
      onBlur={() => setIsFocused(false)}
      onClick={togglePinned}
      onFocus={() => setIsFocused(true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="inline-flex min-h-10 min-w-24 items-center justify-center rounded-lg border border-dashed border-amber-700/50 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 transition hover:border-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      {visible ? <span lang="zh-CN">{gloss}</span> : <span aria-hidden="true">悬停 / 点击</span>}
    </button>
  )
}
