# ContextVocab v2 功能增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 features to ContextVocab: dark mode, search dictionary, bookmarks, stats dashboard.

**Architecture:** Next.js App Router + SQLite (Prisma) single-user app. Each feature is a self-contained vertical slice: API route + page component + optional schema migration. Build order: dark mode (foundation) → search → bookmarks → stats.

**Tech Stack:** Next.js 16.2.9, Tailwind CSS v4, Prisma 5 + SQLite, React 19

## Global Constraints

- Tailwind v4: dark mode uses `@variant dark (&:where(.dark, .dark *));` in CSS, NOT tailwind.config.ts
- No new npm packages — all features use existing dependencies
- All pages keep `max-w-lg` responsive layout for mobile compatibility
- API routes follow existing `route.ts` pattern with `NextResponse.json()`
- Prisma migrations: only 1 migration needed (bookmarked field on UserWord)
- All new pages are `'use client'` matching existing pattern
- All user-specific queries use existing `getLocalUserId()` from `@/lib/prisma`
- Single user only — no auth system

---

### Task 1: Dark Mode Foundation (Layout + CSS + Toggle)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/learn/page.tsx`
- Modify: `src/app/review/page.tsx`

**Interfaces:**
- Consumes: existing Tailwind v4 setup, existing Layout
- Produces: `ThemeToggle` component used in layout nav; `dark:` variant classes usable across all pages

- [ ] **Step 1: Update globals.css — add class-based dark mode variant**

In `src/app/globals.css`, add dark mode variant after existing Tailwind import:

```css
@import "tailwindcss";

@variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* Remove prefers-color-scheme media query — we use class-based now */
```

- [ ] **Step 2: Create ThemeToggle component**

Create `src/components/ThemeToggle.tsx`:

```tsx
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
```

- [ ] **Step 3: Update Layout — add ThemeToggle to nav, add dark classes**

In `src/app/layout.tsx`:

```tsx
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
              <a href="/learn" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">学习</a>
              <a href="/review" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">复习</a>
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
```

- [ ] **Step 4: Update HomePage — add dark classes**

In `src/app/page.tsx`, add `dark:` variants to all `bg-white`/`border-stone-200`/`text-stone-*`/`bg-stone-50` classes. Key changes:

```
bg-white → dark:bg-stone-900
border-stone-200 → dark:border-stone-700
text-stone-600 → dark:text-stone-400
text-stone-500 → dark:text-stone-400
bg-amber-50 → dark:bg-amber-950
text-amber-700 → dark:text-amber-300
bg-stone-100 → dark:bg-stone-800
shadow-sm → (no shadow in dark mode, only border)
hover:bg-stone-50 → dark:hover:bg-stone-800
```

- [ ] **Step 5: Update LearnPage — add dark classes**

In `src/app/learn/page.tsx`, same pattern: add `dark:` variants to all color classes (`bg-white`, `border-stone-200`, `text-stone-*`, `shadow-sm` removal in dark mode).

- [ ] **Step 6: Update ReviewPage — add dark classes**

In `src/app/review/page.tsx`, same pattern.

- [ ] **Step 7: Verify dark mode works**

Run `npm run dev`, open pages. Toggle theme button should switch dark/light. System default should work on first visit. All pages should be readable in both modes.

- [ ] **Step 8: Commit**

```bash
git add src/components/ThemeToggle.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx src/app/learn/page.tsx src/app/review/page.tsx
git commit -m "feat: dark mode with system/light/dark toggle"
```

---

### Task 2: Search & Dictionary

**Files:**
- Create: `src/app/api/search/route.ts`
- Create: `src/app/search/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: existing Word/Meaning/UserWordMeaning models, `getLocalUserId()`
- Produces: `GET /api/search?q=<keyword>` endpoint, `/search?q=<keyword>` page, search input in nav

- [ ] **Step 1: Create search API route**

Create `src/app/api/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] })
  }

  // Search by word text (prefix match > substring) or Chinese definition
  const words = await prisma.word.findMany({
    where: {
      language: 'en',
      OR: [
        { text: { startsWith: q } },
        { text: { contains: q } },
        {
          meanings: {
            some: { definitionCn: { contains: q } },
          },
        },
      ],
    },
    include: {
      meanings: {
        include: {
          userWordMeanings: {
            where: { userWord: { userId } },
            include: {
              sentences: {
                take: 1,
                orderBy: { lastUsedAt: 'desc' },
              },
            },
          },
        },
        take: 3, // Limit meanings to avoid huge payload
      },
      userWords: {
        where: { userId },
      },
    },
    take: 20,
    orderBy: [
      { text: 'asc' },
    ],
  })

  return NextResponse.json({ results: words })
}
```

- [ ] **Step 2: Create search page**

Create `src/app/search/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type SearchResult = {
  id: string
  text: string
  meanings: Array<{
    id: string
    partOfSpeech: string
    definition: string
    definitionCn: string | null
    userWordMeanings: Array<{
      id: string
      mastery: number
      sentences: Array<{
        sentenceText: string
        sentenceCn: string | null
      }>
    }>
  }>
  userWords: Array<{
    id: string
    mastery: number
  }>
}

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialQ) doSearch(initialQ)
  }, [initialQ, doSearch])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(query)}`)
    doSearch(query)
  }

  function masteryLabel(m: number): string {
    if (m >= 75) return '已掌握'
    if (m >= 25) return '学习中'
    if (m > 0) return '初学'
    return '未学'
  }

  function masteryColor(m: number): string {
    if (m >= 75) return 'text-green-600 dark:text-green-400'
    if (m >= 25) return 'text-amber-600 dark:text-amber-400'
    return 'text-stone-400 dark:text-stone-500'
  }

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={handleSubmit} className="mb-6">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词或中文释义..."
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500"
        />
      </form>

      {loading && <p className="text-center text-sm text-stone-400 dark:text-stone-500">搜索中...</p>}

      {!loading && searched && results.length === 0 && (
        <p className="text-center text-sm text-stone-400 dark:text-stone-500">未找到匹配结果</p>
      )}

      <div className="space-y-3">
        {results.map((word) => {
          const userWord = word.userWords[0]
          const learned = userWord && userWord.mastery > 0
          return (
            <div
              key={word.id}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">{word.text}</h3>
                {userWord && (
                  <span className={`text-xs font-medium ${masteryColor(userWord.mastery)}`}>
                    {masteryLabel(userWord.mastery)}
                  </span>
                )}
              </div>

              {word.meanings.map((m) => {
                const uwm = m.userWordMeanings[0]
                const sentence = uwm?.sentences[0]
                return (
                  <div key={m.id} className="mb-2 last:mb-0">
                    <p className="text-sm text-stone-700 dark:text-stone-300">
                      <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                        {m.partOfSpeech}
                      </span>{' '}
                      {m.definition}
                      {m.definitionCn && (
                        <span className="ml-1 text-stone-500 dark:text-stone-400">· {m.definitionCn}</span>
                      )}
                    </p>
                    {sentence && (
                      <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500 italic">
                        {sentence.sentenceText}
                      </p>
                    )}
                  </div>
                )
              })}

              <div className="mt-2 flex gap-2">
                {learned ? (
                  <button
                    onClick={() => router.push('/review')}
                    className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  >
                    去复习
                  </button>
                ) : (
                  <span className="rounded-lg bg-stone-50 px-3 py-1 text-xs text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                    未学
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add search link to nav**

In `src/app/layout.tsx`, add search link before ThemeToggle:

```tsx
<a href="/search" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">搜索</a>
```

- [ ] **Step 4: Verify search works**

Run `npm run dev`. Open `/search`. Type a word. Results should show with status. Try searching by Chinese definition. Click search link in nav.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/search/route.ts src/app/search/page.tsx src/app/layout.tsx
git commit -m "feat: search & dictionary — full-text search by word or Chinese definition"
```

---

### Task 3: Bookmarks / 难词本

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/bookmarks/toggle/route.ts`
- Create: `src/app/api/bookmarks/route.ts`
- Create: `src/app/bookmarks/page.tsx`
- Modify: `src/app/learn/page.tsx`
- Modify: `src/app/review/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: existing UserWord model, learn/review pages
- Produces: bookmarked field on UserWord, toggle/bookmark APIs, bookmarks page

- [ ] **Step 1: Add bookmarked field to UserWord model**

In `prisma/schema.prisma`, add bookmarked field:

```prisma
model UserWord {
  id        String   @id @default(cuid())
  userId    String
  wordId    String
  status    String   @default("learning") // learning | reviewing | mastered
  mastery   Float    @default(0) // 0-100, aggregated from sub-meanings
  bookmarked Boolean @default(false)
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  word    Word    @relation(fields: [wordId], references: [id])
  meanings UserWordMeaning[]

  @@unique([userId, wordId])
}
```

- [ ] **Step 2: Run Prisma migration**

```bash
npx prisma db push
```

- [ ] **Step 3: Create bookmark toggle API**

Create `src/app/api/bookmarks/toggle/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()
  const { wordId } = await req.json()

  if (!wordId) {
    return NextResponse.json({ error: 'wordId required' }, { status: 400 })
  }

  const uw = await prisma.userWord.findUnique({
    where: { userId_wordId: { userId, wordId } },
  })

  if (!uw) {
    return NextResponse.json({ error: 'Word not in your library' }, { status: 404 })
  }

  const updated = await prisma.userWord.update({
    where: { id: uw.id },
    data: { bookmarked: !uw.bookmarked },
  })

  return NextResponse.json({ bookmarked: updated.bookmarked })
}
```

- [ ] **Step 4: Create bookmarks list API**

Create `src/app/api/bookmarks/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()

  const words = await prisma.userWord.findMany({
    where: { userId, bookmarked: true },
    include: {
      word: {
        include: {
          meanings: {
            include: {
              userWordMeanings: {
                where: { userWord: { userId } },
                include: {
                  sentences: {
                    take: 1,
                    orderBy: { lastUsedAt: 'desc' },
                  },
                },
              },
            },
            take: 2,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ bookmarks: words })
}
```

- [ ] **Step 5: Create bookmarks page**

Create `src/app/bookmarks/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type BookmarkItem = {
  id: string
  word: {
    id: string
    text: string
    meanings: Array<{
      id: string
      partOfSpeech: string
      definition: string
      definitionCn: string | null
      userWordMeanings: Array<{
        mastery: number
        sentences: Array<{ sentenceText: string }>
      }>
    }>
  }
}

export default function BookmarksPage() {
  const router = useRouter()
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/bookmarks')
      .then((r) => r.json())
      .then((d) => setItems(d.bookmarks))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleUnbookmark(wordId: string) {
    await fetch('/api/bookmarks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId }),
    })
    setItems((prev) => prev.filter((i) => i.word.id !== wordId))
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-100">难词本</h1>

      {items.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          还没有收藏的单词，在学习页面点击⭐即可收藏
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">{item.word.text}</h3>
              <button
                onClick={() => handleUnbookmark(item.word.id)}
                className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-500 dark:hover:bg-stone-800"
                title="取消收藏"
              >
                ★
              </button>
            </div>

            {item.word.meanings.map((m) => (
              <div key={m.id} className="mb-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  {m.partOfSpeech}
                </span>{' '}
                <span className="text-stone-700 dark:text-stone-300">{m.definition}</span>
                {m.definitionCn && (
                  <span className="ml-1 text-stone-500 dark:text-stone-400">· {m.definitionCn}</span>
                )}
              </div>
            ))}

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => router.push(`/learn?wordId=${item.word.id}`)}
                className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                学习
              </button>
              <button
                onClick={() => router.push('/review')}
                className="rounded-lg bg-stone-100 px-3 py-1 text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                复习
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add bookmark button to LearnPage**

In `src/app/learn/page.tsx`, import `useCallback` and add bookmark button next to the word. Add state `bookmarked` and fetch status on load. The bookmark button should sit near the word heading. On click, call `/api/bookmarks/toggle` with the word ID.

Add this near the word heading area (after the `<h1 className="text-3xl font-bold">{item.word}</h1>` line):

```tsx
<button
  onClick={async () => {
    const res = await fetch('/api/bookmarks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordId: item.id }),
    })
    const data = await res.json()
    if (data.bookmarked !== undefined) setBookmarked(data.bookmarked)
  }}
  className={`ml-2 text-lg ${bookmarked ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400 dark:text-stone-600 dark:hover:text-amber-400'}`}
  title={bookmarked ? '取消收藏' : '收藏'}
>
  {bookmarked ? '★' : '☆'}
</button>
```

And use a `getWordId` helper to resolve the word ID from the learn item (you'll need to add the word's actual ID to the API response — check if `item.wordId` exists or pass `wordId` from the learn API).

For simplicity, the learn API currently returns `id` which is the `userWordMeaningId`. We need the word's actual ID. Update the learn API (`src/app/api/kaoyan/learn/route.ts`) response to include `wordId`:

```ts
return NextResponse.json({
  id: uwm.id,
  wordId: item.word.id, // ADD THIS
  word: item.word.text,
  // ... rest
})
```

Also add `wordId` field to `LearnItem` type in learn page.

- [ ] **Step 7: Add bookmark button to ReviewPage**

In `src/app/review/page.tsx`, similar bookmark button. Add `bookmarked` state per item. The review item already has details — extract wordId from `item.userWord.word.id` path. Add toggle button near word heading in the definition panel (after `showDef` is revealed).

- [ ] **Step 8: Add bookmarks link to nav**

In `src/app/layout.tsx`, add bookmark link:

```tsx
<a href="/bookmarks" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">难词本</a>
```

- [ ] **Step 9: Verify bookmarks work**

Run dev. Learn a word, click star to bookmark. Navigate to /bookmarks, confirm word appears. Click star again in learn page, confirm it unbookmarks. Check dark mode styling.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma src/app/api/bookmarks/ src/app/bookmarks/page.tsx src/app/learn/page.tsx src/app/review/page.tsx src/app/layout.tsx
git commit -m "feat: bookmarks — star words, dedicated list page, learn/review integration"
```

---

### Task 4: Statistics Dashboard

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/app/stats/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: existing UserWordMeaning/ReviewLog models, existing stats API (partial reuse of `/api/kaoyan/stats`)
- Produces: `GET /api/stats` with aggregated data, `/stats` page with visualizations

- [ ] **Step 1: Create stats aggregation API**

Create `src/app/api/stats/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()

  // Overall counts
  const totalWords = await prisma.userWord.count({ where: { userId } })
  const learnedWords = await prisma.userWord.count({
    where: { userId, mastery: { gt: 0 } },
  })

  // Mastery distribution
  const userWords = await prisma.userWord.findMany({
    where: { userId },
    select: { mastery: true },
  })
  const dist = { low: 0, medium: 0, high: 0, mastered: 0 }
  for (const uw of userWords) {
    if (uw.mastery >= 75) dist.mastered++
    else if (uw.mastery >= 50) dist.high++
    else if (uw.mastery >= 25) dist.medium++
    else if (uw.mastery > 0) dist.low++
  }

  // Stage-level progress
  const groups = await prisma.wordGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        include: {
          word: {
            include: {
              userWords: { where: { userId } },
            },
          },
        },
      },
    },
  })

  function getStage(name: string): string {
    if (name.startsWith('高频词')) return '高频词'
    if (name.startsWith('中频词')) return '中频词'
    if (name.startsWith('低频词')) return '低频词'
    if (name.startsWith('偶考词')) return '偶考词'
    if (name.startsWith('基础词')) return '基础词'
    if (name.startsWith('补充词')) return '补充词'
    return '其他'
  }

  const stageMap = new Map<string, { total: number; learned: number; totalMastery: number }>()
  for (const g of groups) {
    const stage = getStage(g.name)
    if (!stageMap.has(stage)) stageMap.set(stage, { total: 0, learned: 0, totalMastery: 0 })
    const entry = stageMap.get(stage)!
    for (const gi of g.words) {
      const uw = gi.word.userWords[0]
      entry.total++
      if (uw && uw.mastery > 0) {
        entry.learned++
        entry.totalMastery += uw.mastery
      }
    }
  }

  const stageOrder = ['高频词', '中频词', '低频词', '偶考词', '基础词', '补充词']
  const stages = stageOrder
    .filter((s) => stageMap.has(s))
    .map((s) => {
      const d = stageMap.get(s)!
      return {
        name: s,
        total: d.total,
        learned: d.learned,
        avgMastery: d.learned > 0 ? Math.round(d.totalMastery / d.learned) : 0,
      }
    })

  // Weak groups (bottom 5 by avgMastery)
  // Reuse group-level data from kaoyan/stats
  const weakGroupsRaw = await Promise.all(
    groups.map(async (g) => {
      const total = g.words.length
      let totalMastery = 0
      let learnedCount = 0
      for (const gi of g.words) {
        const uw = gi.word.userWords[0]
        if (uw && uw.mastery > 0) {
          totalMastery += uw.mastery
          learnedCount++
        }
      }
      return {
        id: g.id,
        name: g.name,
        total,
        learned: learnedCount,
        avgMastery: learnedCount > 0 ? Math.round(totalMastery / learnedCount) : 0,
      }
    })
  )
  const weakGroups = weakGroupsRaw
    .filter((g) => g.learned > 0)
    .sort((a, b) => a.avgMastery - b.avgMastery)
    .slice(0, 5)

  // Review forecast: next 7 days
  const forecastDays = 7
  const reviewForecast: Array<{ date: string; dueCount: number }> = []
  for (let i = 0; i < forecastDays; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 86400000)

    const count = await prisma.userWordMeaning.count({
      where: {
        userWord: { userId },
        nextReviewAt: { gte: startOfDay, lt: endOfDay },
        interval: { gt: 0 },
      },
    })
    reviewForecast.push({
      date: startOfDay.toISOString().split('T')[0],
      dueCount: count,
    })
  }

  // Daily activity: last 30 days from ReviewLog
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const logs = await prisma.reviewLog.findMany({
    where: {
      reviewSession: { userId },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const dailyMap = new Map<string, number>()
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    dailyMap.set(key, 0)
  }
  for (const log of logs) {
    const key = log.createdAt.toISOString().split('T')[0]
    if (dailyMap.has(key)) dailyMap.set(key, dailyMap.get(key)! + 1)
  }
  const dailyActivity = Array.from(dailyMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))

  return NextResponse.json({
    overall: { totalWords, learnedWords, avgMastery: learnedWords > 0 ? Math.round(userWords.reduce((s, u) => s + u.mastery, 0) / learnedWords) : 0 },
    masteryDistribution: dist,
    stages,
    weakGroups,
    reviewForecast,
    dailyActivity,
  })
}
```

- [ ] **Step 2: Create stats page**

Create `src/app/stats/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'

type Stats = {
  overall: { totalWords: number; learnedWords: number; avgMastery: number }
  masteryDistribution: { low: number; medium: number; high: number; mastered: number }
  stages: Array<{ name: string; total: number; learned: number; avgMastery: number }>
  weakGroups: Array<{ id: string; name: string; total: number; learned: number; avgMastery: number }>
  reviewForecast: Array<{ date: string; dueCount: number }>
  dailyActivity: Array<{ date: string; count: number }>
}

function maxVal(arr: Array<{ count: number }>): number {
  return Math.max(...arr.map((d) => d.count), 1)
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
      <div className={`h-full rounded-full transition-all ${className}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  )
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  if (!stats) {
    return <div className="py-16 text-center text-sm text-stone-400">无法加载统计数据</div>
  }

  const formatDate = (d: string) => {
    const parts = d.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">学习统计</h1>

      {/* Overall progress */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">总进度</h2>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.overall.learnedWords}</span>
          <span className="text-sm text-stone-400 dark:text-stone-500">/ {stats.overall.totalWords} 词</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400" style={{ width: `${(stats.overall.learnedWords / stats.overall.totalWords) * 100}%` }} />
        </div>
        {stats.overall.avgMastery > 0 && (
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
            平均掌握率 {stats.overall.avgMastery}%
          </p>
        )}
      </div>

      {/* Mastery distribution */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">掌握分布</h2>
        <div className="space-y-2">
          {[
            { key: 'mastered', label: '掌握 (75-100%)', color: 'bg-green-500', value: stats.masteryDistribution.mastered },
            { key: 'high', label: '良好 (50-75%)', color: 'bg-emerald-400', value: stats.masteryDistribution.high },
            { key: 'medium', label: '一般 (25-50%)', color: 'bg-amber-400', value: stats.masteryDistribution.medium },
            { key: 'low', label: '初学 (0-25%)', color: 'bg-red-400', value: stats.masteryDistribution.low },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-3 text-xs">
              <span className="w-24 text-stone-600 dark:text-stone-400">{item.label}</span>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / Math.max(stats.overall.learnedWords, 1)) * 100}%` }} />
                </div>
              </div>
              <span className="w-8 text-right text-stone-500 dark:text-stone-400">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stage progress */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">各阶段进度</h2>
        <div className="space-y-3">
          {stats.stages.map((s) => (
            <div key={s.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700 dark:text-stone-300">{s.name}</span>
                <span className="text-stone-400 dark:text-stone-500">
                  {s.learned}/{s.total} · {s.avgMastery}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400" style={{ width: `${(s.learned / s.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weak groups */}
      {stats.weakGroups.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">薄弱分组</h2>
          <div className="space-y-2">
            {stats.weakGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs">
                <span className="text-stone-700 dark:text-stone-300">{g.name}</span>
                <span className="text-red-500 dark:text-red-400">{g.avgMastery}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review forecast */}
      {stats.reviewForecast.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">未来 7 天复习量</h2>
          <div className="flex items-end gap-1.5" style={{ height: '80px' }}>
            {stats.reviewForecast.map((d) => {
              const max = maxVal(stats.reviewForecast)
              const height = max > 0 ? (d.dueCount / max) * 100 : 0
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{d.dueCount}</span>
                  <div className="w-full rounded-t-md bg-amber-400" style={{ height: `${height}%`, minHeight: d.dueCount > 0 ? '4px' : '0' }} />
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatDate(d.date)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Daily activity */}
      {stats.dailyActivity.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近 30 天学习记录</h2>
          <div className="flex items-end gap-[3px]" style={{ height: '60px' }}>
            {stats.dailyActivity.map((d) => {
              const max = maxVal(stats.dailyActivity)
              const height = max > 0 ? (d.count / max) * 100 : 0
              return (
                <div
                  key={d.date}
                  className="flex-1 rounded-t-sm bg-stone-400 dark:bg-stone-500"
                  style={{ height: `${height}%`, minHeight: d.count > 0 ? '2px' : '0' }}
                  title={`${d.date}: ${d.count} 词`}
                />
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-stone-400 dark:text-stone-500">
            <span>{stats.dailyActivity[0]?.date?.slice(5) || ''}</span>
            <span>{stats.dailyActivity[stats.dailyActivity.length - 1]?.date?.slice(5) || ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add stats link to nav**

In `src/app/layout.tsx`, add stats link:

```tsx
<a href="/stats" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">统计</a>
```

- [ ] **Step 4: Verify stats work**

Run dev. Open `/stats`. Confirm all sections load: overall progress, mastery distribution, stages, weak groups, review forecast, daily activity. Check dark mode.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stats/route.ts src/app/stats/page.tsx src/app/layout.tsx
git commit -m "feat: stats dashboard — overall progress, stages, weak groups, review forecast, daily activity"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 4 features mapped to tasks. Dark mode (Task 1), Search (Task 2), Bookmarks (Task 3), Stats (Task 4). Build order matches spec.
2. **Placeholder scan:** No TBD/TODO. All code blocks complete. No "fill in details" or "handle edge cases" without code.
3. **Type consistency:** API response shapes consistent within and across tasks. route.ts patterns match existing codebase (`NextResponse.json`, `getLocalUserId`).
