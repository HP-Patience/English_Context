import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ContextVocab — 语境背单词',
  description: '通过个性化语境背英语单词',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} min-h-screen bg-stone-50 text-stone-900 antialiased`}>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight">
              ContextVocab
            </a>
            <nav className="flex items-center gap-4 text-sm">
              <a href="/learn" className="text-stone-600 hover:text-stone-900">
                学习
              </a>
              <a href="/review" className="text-stone-600 hover:text-stone-900">
                复习
              </a>
              <a href="/manual" className="text-stone-600 hover:text-stone-900">
                +手动
              </a>
              <a href="/settings" className="text-stone-600 hover:text-stone-900">
                设置
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
