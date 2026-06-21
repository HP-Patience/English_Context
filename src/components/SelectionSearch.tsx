'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Pos = { x: number; y: number }

export default function SelectionSearch({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const router = useRouter()
  const [selectedText, setSelectedText] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function isSelectionInside() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    return containerRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer) ?? false
  }

  function updateSelection() {
    const sel = window.getSelection()
    const text = sel?.toString().trim()

    if (!text || !isSelectionInside()) {
      setSelectedText('')
      setPos(null)
      return
    }

    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      setSelectedText('')
      setPos(null)
      return
    }

    setSelectedText(text)
    setPos({ x: rect.left + rect.width / 2, y: rect.top })
  }

  function handleDismiss(e: MouseEvent | TouchEvent) {
    const target = e.target as Node
    if (btnRef.current?.contains(target)) return
    if (containerRef.current?.contains(target)) return
    setSelectedText('')
    setPos(null)
  }

  function handleScroll() {
    setSelectedText('')
    setPos(null)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setSelectedText('')
      setPos(null)
    }
  }

  useEffect(() => {
    document.addEventListener('selectionchange', updateSelection)
    document.addEventListener('mousedown', handleDismiss)
    document.addEventListener('touchstart', handleDismiss)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('selectionchange', updateSelection)
      document.removeEventListener('mousedown', handleDismiss)
      document.removeEventListener('touchstart', handleDismiss)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  function handleSearch() {
    if (!selectedText) return
    router.push(`/search?q=${encodeURIComponent(selectedText)}`)
    setSelectedText('')
    setPos(null)
  }

  return (
    <div ref={containerRef} className={className}>
      {children}
      {selectedText && pos && (
        <button
          ref={btnRef}
          onClick={handleSearch}
          className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          style={{ left: pos.x, top: pos.y - 4 }}
        >
          搜索
        </button>
      )}
    </div>
  )
}
