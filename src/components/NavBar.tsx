'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import ThemeToggle from './ThemeToggle'

const mainLinks = [
  { href: '/story', label: '故事' },
  { href: '/learn', label: '单词' },
  { href: '/review', label: '复习' },
  { href: '/bookmarks', label: '收藏' },
  { href: '/interaction', label: '互动' },
]
const iconControlClass = 'grid h-10 w-10 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'

export default function NavBar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  if (pathname === '/login') return <ThemeToggle />

  return (
    <>
      <div className="flex items-center gap-3 sm:gap-5">
        <nav aria-label="主导航" className="hidden items-center gap-5 text-sm md:flex">
          {mainLinks.map(link => (
            <Link key={link.href} href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}
              className={`border-b-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 ${isCurrent(link.href) ? 'border-stone-900 font-semibold text-stone-900 dark:border-stone-100 dark:text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {/* Iconify / Lucide search and settings (ISC), embedded locally. */}
          <Link href="/search" aria-label="搜索" title="搜索" aria-current={isCurrent('/search') ? 'page' : undefined} onClick={() => setOpen(false)} className={iconControlClass}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21l-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
          </Link>
          <Link href="/settings" aria-label="设置" title="设置" aria-current={isCurrent('/settings') ? 'page' : undefined} onClick={() => setOpen(false)} className={iconControlClass}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0a2.34 2.34 0 0 0 3.319 1.915a2.34 2.34 0 0 1 2.33 4.033a2.34 2.34 0 0 0 0 3.831a2.34 2.34 0 0 1-2.33 4.033a2.34 2.34 0 0 0-3.319 1.915a2.34 2.34 0 0 1-4.659 0a2.34 2.34 0 0 0-3.32-1.915a2.34 2.34 0 0 1-2.33-4.033a2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>
          </Link>
          <ThemeToggle />
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? '关闭菜单' : '打开菜单'} aria-expanded={open} aria-controls="mobile-navigation" className={`${iconControlClass} md:hidden`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
          </button>
        </div>
      </div>
      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setOpen(false)} />
          <nav id="mobile-navigation" aria-label="移动导航" className="absolute left-0 right-0 top-full z-50 flex flex-col border-b border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900 md:hidden">
            {mainLinks.map(link => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} aria-current={isCurrent(link.href) ? 'page' : undefined}
                className={`rounded-lg px-4 py-3 text-sm ${isCurrent(link.href) ? 'bg-stone-100 font-semibold text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'}`}>
                {link.label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </>
  )
}
