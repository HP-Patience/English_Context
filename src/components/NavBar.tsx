'use client'

import { useState } from 'react'
import ThemeToggle from './ThemeToggle'

const navLinks = [
  { href: '/review', label: '复习' },
  { href: '/search', label: '搜索' },
  { href: '/stats', label: '统计' },
  { href: '/bookmarks', label: '难词本' },
  { href: '/settings', label: '设置' },
]

export default function NavBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-4 text-sm">
        {navLinks.map(link => (
          <a
            key={link.href}
            href={link.href}
            className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            {link.label}
          </a>
        ))}
        <ThemeToggle />
      </nav>

      {/* Mobile controls */}
      <div className="flex md:hidden items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => setOpen(!open)}
          className="p-1 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          aria-label={open ? '关闭菜单' : '打开菜单'}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {open ? (
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 border-b border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900">
            <div className="mx-auto max-w-4xl px-4 py-2">
              <nav className="flex flex-col gap-1">
                {navLinks.map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-4 py-3 text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </>
      )}
    </>
  )
}
