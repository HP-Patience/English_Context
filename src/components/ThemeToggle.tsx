'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme')
    const isDark =
      stored === 'dark' ||
      (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setDark(isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg transition-colors text-stone-500 hover:text-stone-800 hover:bg-stone-200/50 dark:text-stone-400 dark:hover:text-amber-300 dark:hover:bg-stone-800/50"
      title={dark ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {mounted ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-5 h-5 transition-all duration-500 ${
            dark
              ? 'text-amber-400 fill-amber-400/15'
              : 'text-stone-500'
          }`}
          style={
            dark
              ? {
                  filter:
                    'drop-shadow(0 0 6px #fbbf24) drop-shadow(0 0 12px #f59e0b)',
                }
              : undefined
          }
        >
          {/* 灯泡玻璃罩 — 小头圆肚 */}
          <path d="M12 5C7 5 6 8 6 12C6 14 7 15.5 9 16.5L9 17L15 17L15 16.5C17 15.5 18 14 18 12C18 8 17 5 12 5Z" />
          {/* 灯丝 — 短横线，偏下 */}
          <path d="M10 11h4" />
          <path d="M10.5 12.5h3" />
          <path d="M11 14h2" />
          {/* 灯座 — 加长 */}
          <path d="M9 18h6" />
          <path d="M9.5 19.5h5" />
          <path d="M10 21h4" />
          <path d="M10.5 22h3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-5 h-5 invisible" />
      )}
    </button>
  )
}
