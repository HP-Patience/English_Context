'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { MorphIcon } from 'morphicons/react'

// Local Sun/Moon paths consumed by Morphicons; no remote icon requests.
const sun = 'M16 12A4 4 0 1 1 8 12A4 4 0 1 1 16 12Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41'
const moon = 'M20.9 13A9 9 0 0 1 11 3.1A9 9 0 1 0 20.9 13Z'
const themeSpring = { stiffness: 500, damping: 45 }

function readTheme() {
  const stored = localStorage.getItem('theme')
  return stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener('contextvocab-theme-change', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener('contextvocab-theme-change', onChange)
  }
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore<boolean | null>(subscribeTheme, readTheme, () => null)
  useEffect(() => {
    if (dark !== null) document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const toggle = () => {
    const next = !dark
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
    window.dispatchEvent(new Event('contextvocab-theme-change'))
  }

  const label = dark ? '切换到亮色模式' : '切换到暗色模式'
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className="grid h-10 w-10 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100">
      {dark !== null ? <MorphIcon icon={dark ? sun : moon} size={20} strokeWidth={2} spring={themeSpring} reducedMotion="user" /> : <svg aria-hidden="true" width="20" height="20" className="invisible" />}
    </button>
  )
}
