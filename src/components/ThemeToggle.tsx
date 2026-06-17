'use client'

import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) setTheme(stored)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('theme', theme)

    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      root.classList.toggle('dark', mq.matches)
    }
  }, [theme, mounted])

  const next = () => {
    setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'))
  }

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'

  return (
    <button
      onClick={next}
      className="text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
      title={`Theme: ${theme}`}
    >
      {mounted ? icon : ''}
    </button>
  )
}
