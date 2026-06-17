import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ThemeToggle from '@/components/ThemeToggle'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ContextVocab — 语境背单词',
  description: '通过个性化语境背英语单词',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100`}>
        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight dark:text-stone-100">
              ContextVocab
            </a>
            <nav className="flex items-center gap-4 text-sm">
              <a href="/" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">学习</a>
              <a href="/review" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">复习</a>
              <a href="/search" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">搜索</a>
              <a href="/stats" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">统计</a>
              <a href="/bookmarks" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">难词本</a>
              <a href="/manual" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">+手动</a>
              <a href="/settings" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">设置</a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
