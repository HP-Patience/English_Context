'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type Pos = { readonly x: number; readonly y: number }

type ActiveSelection = {
  readonly range: Range
  readonly text: string
}

type SelectionSearchProps = {
  readonly children: ReactNode
  readonly className?: string
}

const interactiveSelector = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[tabindex]',
].join(',')

export default function SelectionSearch({ children, className = '' }: SelectionSearchProps) {
  const router = useRouter()
  const [selectedText, setSelectedText] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function getActiveSelection(container: HTMLDivElement): ActiveSelection | null {
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null

    const text = selection.toString().trim()
    if (text.length === 0) return null

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return null

    return { range, text }
  }

  function updateSelection() {
    if (btnRef.current === document.activeElement) return

    const container = containerRef.current
    const selection = container === null ? null : getActiveSelection(container)

    if (selection === null) {
      setSelectedText('')
      setPos(null)
      return
    }

    const rect = selection.range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      setSelectedText('')
      setPos(null)
      return
    }

    setSelectedText(selection.text)
    setPos({ x: rect.left + rect.width / 2, y: rect.top })
  }

  function handleDismiss(e: MouseEvent | TouchEvent) {
    const target = e.target
    if (!(target instanceof Node)) return
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

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Node)) return

    const targetElement = target instanceof Element ? target : target.parentElement
    if (targetElement?.closest(interactiveSelector)) return

    const container = containerRef.current
    const selection = container === null ? null : getActiveSelection(container)
    if (selection === null || !selection.range.intersectsNode(target)) return

    event.preventDefault()
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
    <div ref={containerRef} className={`selection-search ${className}`} onContextMenu={handleContextMenu}>
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
