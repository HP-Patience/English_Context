# Tier 2 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA support, daily goal tracking with streak counting, and error word analysis to ContextVocab.

**Architecture:** Three independent features implemented sequentially. PWA uses @serwist/next for service worker + manifest. Daily goal adds a DailyGoal Prisma model and hooks into existing learn/review API POST handlers. Error analysis is read-only aggregation over existing ReviewLog and UserWordMeaning tables.

**Tech Stack:** Next.js 16 (App Router), Prisma + SQLite, Tailwind CSS 4, @serwist/next (PWA only)

## Global Constraints

- No heavy chart libraries (heatmap and trend line use CSS/SVG)
- Match existing style: Tailwind + stone palette + no animations + dark mode (`dark:` prefix)
- All pages `'use client'` (matching existing pattern)
- API error handling: try/catch with generic error messages, use `getLocalUserId()` from `@/lib/prisma`
- No new dependencies except `@serwist/next` for PWA
- No multi-user support
- No quiz mode, push notifications, TTS, data export/import

---

## Phase 1: PWA

### Task 1: Install @serwist/next and create static assets

**Files:**
- Create: `public/manifest.json`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`

**Produces:** Manifest and icon files on disk, @serwist/next installed.

- [ ] **Step 1: Install @serwist/next**

```bash
npm install @serwist/next
```
Expected: dependency added to package.json.

- [ ] **Step 2: Create web manifest**

Create `public/manifest.json`:
```json
{
  "name": "考研词汇",
  "short_name": "考研词汇",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1c1917",
  "theme_color": "#1c1917",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Generate icon PNGs**

Create a simple script `scripts/generate-icons.js`:
```js
// Generates solid-color placeholder icons. Replace with custom design later.
const { createCanvas } = require('canvas'); // skip — use a manual approach instead
```

Since we don't have `canvas` installed, generate placeholder icons using a minimal approach. Create `public/icon-192.png` and `public/icon-512.png` as solid #1c1917 squares using a Node.js approach.

Run this inline script:
```bash
node -e "
const { writeFileSync } = require('fs');
// Minimal 1x1 PNG in #1c1917, then scale metadata
// PNG: IHDR + IDAT + IEND
function createPNG(size) {
  const { deflateSync } = require('zlib');
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // RGB
  const ihdr = chunk('IHDR', ihdrData);
  
  const rawData = Buffer.alloc(size * size * 3 + size);
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      rawData[offset] = 0x1c;
      rawData[offset + 1] = 0x19;
      rawData[offset + 2] = 0x17;
    }
  }
  const idat = chunk('IDAT', deflateSync(rawData));
  const iend = chunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeB, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeB, data, crcBuf]);
}
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c; }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
writeFileSync('public/icon-192.png', createPNG(192));
writeFileSync('public/icon-512.png', createPNG(512));
console.log('Icons generated');
"
```
Expected: `public/icon-192.png` and `public/icon-512.png` created.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/manifest.json public/icon-192.png public/icon-512.png
git commit -m "feat: add PWA manifest and icons"
```

---

### Task 2: Configure @serwist/next

**Files:**
- Modify: `next.config.ts`

**Produces:** Service worker generated at build time.

- [ ] **Step 1: Add @serwist/next to next.config.ts**

Replace `next.config.ts` content:

```ts
import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist({
  swSrc: undefined, // use @serwist/next default SW
  swDest: "sw.js",
  globDirectory: ".next",
  maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /\.(?:js|css|woff2?|png|jpg|svg|ico)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
})(nextConfig);
```

- [ ] **Step 2: Verify production build works**

```bash
npx next build 2>&1 | tail -5
```
Expected: Build completes. Check that `public/sw.js` is generated (may be in `.next`).

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: configure @serwist/next for PWA service worker"
```

---

### Task 3: Add PWA meta tags to layout

**Files:**
- Modify: `src/app/layout.tsx`

**Interface:**
- Consumes: `public/manifest.json` (from Task 1)
- Produces: `<link rel="manifest">` and `<meta name="theme-color">` in document head

- [ ] **Step 1: Add manifest link and theme-color meta to layout.tsx**

In `src/app/layout.tsx`, replace the `<html>` tag with one that includes the manifest link, and add `apple-mobile-web-app-capable` meta.

Replace:
```tsx
<html lang="zh-CN" suppressHydrationWarning>
```
with:
```tsx
<html lang="zh-CN" suppressHydrationWarning>
<head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#1c1917" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0c0a09" media="(prefers-color-scheme: dark)" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</head>
```

Wait — Next.js layout already includes `<head>` from metadata API. A cleaner approach that works with Next.js 16 is to add these via the metadata export. Update the existing `metadata` export in `layout.tsx`:

Replace:
```tsx
export const metadata: Metadata = {
  title: 'ContextVocab — 语境背单词',
  description: '通过个性化语境背英语单词',
}
```
with:
```tsx
export const metadata: Metadata = {
  title: 'ContextVocab — 语境背单词',
  description: '通过个性化语境背英语单词',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
}
```

And add `<meta name="theme-color">` via the existing `<head>` approach — but since Next.js metadata API doesn't directly support dual-scheme theme-color, use the viewport export or add it in the html. Actually, the simplest approach that works: add the theme-color meta tags to the `<html>` block below `children` content or use the `metadata.themeColor` field for a single value.

Since we want dual-scheme theme-color, add it inside the `<head>` before `<body>` via a script or metadata approach. The simplest valid approach for Next.js 16:

```tsx
export const metadata: Metadata = {
  title: 'ContextVocab — 语境背单词',
  description: '通过个性化语境背英语单词',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  other: {
    'theme-color': '#1c1917',
  },
}
```

For dual-scheme support, keep it simple: single theme-color is sufficient.

- [ ] **Step 2: Verify the meta tags appear**

Run `npm run dev` and inspect page source. Check for `<link rel="manifest">` and `<meta name="theme-color">`.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add PWA manifest link and theme-color meta"
```

---

### Task 4: Add install prompt banner to home page

**Files:**
- Modify: `src/app/page.tsx`

**Interface:**
- Consumes: PWA manifest linked (from Task 3)
- Produces: `PwaInstallBanner` state and UI on home page

- [ ] **Step 1: Add install banner logic to page.tsx**

Add after the existing `useState` declarations (before `useEffect`):

```tsx
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Check if dismissed within 7 days
    const dismissedAt = localStorage.getItem('pwa-install-dismissed')
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallBanner(false)
    if (outcome === 'accepted') {
      localStorage.removeItem('pwa-install-dismissed')
    }
  }
```

- [ ] **Step 2: Add the banner UI**

Add just above the `</div>` closing tag (the outermost `<div className="mx-auto max-w-lg pt-4">`), before the closing `</div>`:

```tsx
      {/* PWA install banner */}
      {showInstallBanner && (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              添加到主屏幕，随时随地背单词
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                安装
              </button>
              <button
                onClick={() => {
                  setShowInstallBanner(false)
                  localStorage.setItem('pwa-install-dismissed', String(Date.now()))
                }}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-600 dark:border-stone-700 dark:hover:text-stone-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify dev build**

```bash
npm run dev
```
Open in browser. On desktop, banner won't show (no `beforeinstallprompt` on desktop Chrome without PWA install). Use Chrome DevTools → Application → Manifest to verify manifest is loadable.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add PWA install prompt banner"
```

---

## Phase 2: 每日目标打卡

### Task 5: Add DailyGoal model and User.dailyTarget

**Files:**
- Modify: `prisma/schema.prisma`

**Produces:** New `DailyGoal` table and `dailyTarget` field on `User`.

- [ ] **Step 1: Add DailyGoal model to schema.prisma**

Add after the `ReviewLog` model:

```prisma
model DailyGoal {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  target    Int
  learned   Int      @default(0)
  reviewed  Int      @default(0)
  completed Boolean  @default(false)

  @@unique([userId, date])
  @@index([userId])
}
```

- [ ] **Step 2: Add dailyTarget to User model**

Add after the `llmConfig` field on `User`:

```prisma
  dailyTarget Int       @default(30)
```

- [ ] **Step 3: Run migration**

```bash
npx prisma db push
```
Expected: "Your database is now in sync with your schema."

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add DailyGoal model and User.dailyTarget"
```

---

### Task 6: Create streak calculation utility

**Files:**
- Create: `src/lib/streak.ts`

**Produces:** `calculateStreak()` and `getLongestStreak()` functions.

- [ ] **Step 1: Write streak.ts**

Create `src/lib/streak.ts`:

```ts
import { prisma } from './prisma'

export interface GoalRecord {
  date: Date
  completed: boolean
  target: number
  learned: number
  reviewed: number
}

/**
 * Calculate current streak: consecutive days with completed=true,
 * counting backwards from today (or yesterday if today not yet completed).
 * Returns { current, longest }.
 */
export async function calculateStreak(
  userId: string
): Promise<{ current: number; longest: number }> {
  const records = await prisma.dailyGoal.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true, completed: true },
  })

  if (records.length === 0) return { current: 0, longest: 0 }

  // Current streak: start from today, go backwards
  let current = 0
  const todayStr = toDateString(new Date())
  let expectedDate = new Date()

  for (const record of records) {
    const recordStr = toDateString(record.date)
    const expectedStr = toDateString(expectedDate)

    if (recordStr === expectedStr) {
      if (record.completed) {
        current++
      } else if (recordStr === todayStr) {
        // today not completed yet, skip it
        continue
      } else {
        break
      }
    } else if (recordStr === todayStr && record.completed) {
      // today completed
      current++
    } else {
      break
    }
    expectedDate.setDate(expectedDate.getDate() - 1)
  }

  // Longest streak: scan all records
  let longest = 0
  let running = 0
  const sorted = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  for (const record of sorted) {
    if (record.completed) {
      running++
      if (running > longest) longest = running
    } else {
      running = 0
    }
  }

  return { current, longest }
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/streak.ts
git commit -m "feat: add streak calculation utility"
```

---

### Task 7: Create daily-goal API route

**Files:**
- Create: `src/app/api/daily-goal/route.ts`

**Produces:** `GET /api/daily-goal` (today's goal), `GET /api/daily-goal?range=N` (N days history), `POST /api/daily-goal` (update target setting).

- [ ] **Step 1: Write the route**

Create `src/app/api/daily-goal/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateStreak } from '@/lib/streak'

function todayStart(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const { searchParams } = new URL(req.url)
    const rangeStr = searchParams.get('range')
    const range = rangeStr ? parseInt(rangeStr) : null

    if (range) {
      // Return N days of history for heatmap
      const startDate = new Date(todayStart())
      startDate.setDate(startDate.getDate() - range + 1)
      const records = await prisma.dailyGoal.findMany({
        where: { userId, date: { gte: startDate } },
        orderBy: { date: 'asc' },
      })
      // Fill missing days with empty slots
      const result = []
      const d = new Date(startDate)
      const recordMap = new Map(
        records.map((r) => [r.date.toISOString().split('T')[0], r])
      )
      for (let i = 0; i < range; i++) {
        const key = d.toISOString().split('T')[0]
        const record = recordMap.get(key)
        result.push({
          date: key,
          learned: record?.learned ?? 0,
          reviewed: record?.reviewed ?? 0,
          target: record?.target ?? 0,
          completed: record?.completed ?? false,
        })
        d.setDate(d.getDate() + 1)
      }
      return NextResponse.json(result)
    }

    // Return today's goal
    const today = todayStart()
    let goal = await prisma.dailyGoal.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (!goal) {
      // Get user's daily target
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { dailyTarget: true },
      })
      goal = await prisma.dailyGoal.create({
        data: {
          userId,
          date: today,
          target: user?.dailyTarget ?? 30,
          learned: 0,
          reviewed: 0,
          completed: false,
        },
      })
    }

    const streak = await calculateStreak(userId)

    return NextResponse.json({
      ...goal,
      streak,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch daily goal' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const { target } = await req.json()

    if (typeof target !== 'number' || target < 1 || target > 500) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { dailyTarget: target },
    })

    // Update today's goal target too if exists
    const today = todayStart()
    await prisma.dailyGoal.upsert({
      where: { userId_date: { userId, date: today } },
      update: { target },
      create: { userId, date: today, target, learned: 0, reviewed: 0 },
    })

    return NextResponse.json({ target })
  } catch {
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify endpoint**

```bash
npm run dev
```
Then in another terminal:
```bash
curl -s http://localhost:3000/api/daily-goal | head -c 200
```
Expected: JSON with `id`, `userId`, `date`, `target`, `learned`, `reviewed`, `completed`, `streak`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/daily-goal/route.ts
git commit -m "feat: add daily-goal API route"
```

---

### Task 8: Hook daily goal into learn API POST

**Files:**
- Modify: `src/app/api/kaoyan/learn/route.ts`

**Interface:**
- Consumes: `DailyGoal` model (from Task 5)
- Produces: DailyGoal.learned incremented on each learn submission

- [ ] **Step 1: Add DailyGoal upsert to learn POST**

In `src/app/api/kaoyan/learn/route.ts`, at the end of the `POST` function, just before `return NextResponse.json(...)`, add:

```ts
  // Upsert today's daily goal
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyTarget: true },
  })
  const goal = await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: today } },
    update: { learned: { increment: 1 } },
    create: {
      userId,
      date: today,
      target: user?.dailyTarget ?? 30,
      learned: 1,
      reviewed: 0,
    },
  })
  if (goal.learned >= goal.target && !goal.completed) {
    await prisma.dailyGoal.update({
      where: { id: goal.id },
      data: { completed: true },
    })
  }
```

The `POST` function currently ends with `return NextResponse.json(...)`. Insert the above code after the `reviewLog.create` block and before the return statement. Specifically, after:

```ts
  await prisma.reviewLog.create({
    data: {
      reviewSessionId: session.id,
      userWordMeaningId,
      sentenceText: '',
      testLevel: 1,
      result: grade >= 3 ? 'pass' : 'fail',
    },
  })

  return NextResponse.json({ grade, newMastery, wordMastery: avgMastery })
```

Insert the daily goal code between the `reviewLog.create` and `return`:

```ts
  // Upsert daily goal
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyTarget: true },
  })
  const goal = await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: today } },
    update: { learned: { increment: 1 } },
    create: {
      userId,
      date: today,
      target: user?.dailyTarget ?? 30,
      learned: 1,
      reviewed: 0,
    },
  })
  if (goal.learned >= goal.target && !goal.completed) {
    await prisma.dailyGoal.update({
      where: { id: goal.id },
      data: { completed: true },
    })
  }

  return NextResponse.json({ grade, newMastery, wordMastery: avgMastery })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/kaoyan/learn/route.ts
git commit -m "feat: hook daily goal increment into learn API"
```

---

### Task 9: Hook daily goal into review API POST

**Files:**
- Modify: `src/app/api/review/submit/route.ts`

**Interface:**
- Consumes: `DailyGoal` model (from Task 5)
- Produces: DailyGoal.reviewed incremented on each review submission

- [ ] **Step 1: Add DailyGoal upsert to review POST**

In `src/app/api/review/submit/route.ts`, at the end of the `POST` function, after the `reviewLog.create` block and before the return:

```ts
  // Upsert daily goal
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyTarget: true },
  })
  const goal = await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: today } },
    update: { reviewed: { increment: 1 } },
    create: {
      userId,
      date: today,
      target: user?.dailyTarget ?? 30,
      learned: 0,
      reviewed: 1,
    },
  })
  if (goal.learned >= goal.target && !goal.completed) {
    await prisma.dailyGoal.update({
      where: { id: goal.id },
      data: { completed: true },
    })
  }
```

Insert it after the `reviewLog.create` block:
```
  await prisma.reviewLog.create({...})

  // <-- insert daily goal code here

  return NextResponse.json({...})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/review/submit/route.ts
git commit -m "feat: hook daily goal increment into review API"
```

---

### Task 10: Update home page with daily goal status bar

**Files:**
- Modify: `src/app/page.tsx`

**Interface:**
- Consumes: `GET /api/daily-goal` (from Task 7), `GET /api/kaoyan/stats` (existing)
- Produces: Status bar showing today's progress + streak

- [ ] **Step 1: Add daily goal fetch to page.tsx**

Add after the existing stats `useEffect`:

```tsx
  const [dailyGoal, setDailyGoal] = useState<any>(null)

  useEffect(() => {
    fetch('/api/daily-goal')
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setDailyGoal(data)
      })
      .catch(() => {})
  }, [])
```

- [ ] **Step 2: Replace the overall progress card with daily goal card**

Replace the existing progress card (the `{/* Overall progress */}` block) with:

```tsx
      {/* Daily goal progress */}
      {dailyGoal && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              🔥 连续 {dailyGoal.streak?.current ?? 0} 天
            </span>
            <span className="text-stone-500 dark:text-stone-400">
              今日 {dailyGoal.learned}/{dailyGoal.target} 词
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-stone-900 transition-all dark:bg-stone-400"
              style={{
                width: `${dailyGoal.target > 0 ? Math.min(100, (dailyGoal.learned / dailyGoal.target) * 100) : 0}%`,
              }}
            />
          </div>
          {dailyGoal.reviewed > 0 && (
            <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
              已复习 {dailyGoal.reviewed} 词
            </p>
          )}
          {dailyGoal.completed && (
            <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">
              ✓ 今日目标达成
            </p>
          )}
        </div>
      )}
```

Keep the original overall progress card but display it only when `dailyGoal` is not loaded (fallback), OR remove it and keep only `dailyGoal`. Per spec: replace the static progress bar. So remove the old `{/* Overall progress */}` block entirely and use only the new one.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace home progress with daily goal status bar"
```

---

### Task 11: Add daily target setting to settings page

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interface:**
- Consumes: `GET /api/daily-goal`, `POST /api/daily-goal` (from Task 7)

- [ ] **Step 1: Add a third tab "每日目标" to settings**

In `src/app/settings/page.tsx`, add `'goal'` to the tab type union:

```tsx
const [tab, setTab] = useState<'llm' | 'interests' | 'goal'>('llm')
```

Add a third tab button after the "兴趣领域" button:

```tsx
        <button
          onClick={() => setTab('goal')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'goal' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          每日目标
        </button>
```

- [ ] **Step 2: Add goal tab content**

Add state variables before `useEffect`:

```tsx
  const [dailyTarget, setDailyTarget] = useState(30)
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalSaved, setGoalSaved] = useState(false)
```

Add a `useEffect` to load current target:

```tsx
  useEffect(() => {
    fetch('/api/daily-goal')
      .then((r) => r.json())
      .then((data) => {
        if (data.target) setDailyTarget(data.target)
      })
      .catch(() => {})
  }, [])
```

After the `{tab === 'interests' ? (...)}` block and before the closing `</div>` of the component, add the goal tab:

```tsx
      {tab === 'goal' && (
        <div className="space-y-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            设定每日学习目标，完成打卡记录连续天数。
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              每日目标词数
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
            />
          </div>
          <button
            onClick={async () => {
              setSavingGoal(true)
              try {
                await fetch('/api/daily-goal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ target: dailyTarget }),
                })
                setGoalSaved(true)
                setTimeout(() => setGoalSaved(false), 2000)
              } finally {
                setSavingGoal(false)
              }
            }}
            disabled={savingGoal}
            className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {savingGoal ? '保存中...' : goalSaved ? '✓ 已保存' : '保存目标'}
          </button>
        </div>
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add daily goal target setting to settings page"
```

---

### Task 12: Add goal heatmap and streak to stats page

**Files:**
- Modify: `src/app/stats/page.tsx`
- Modify: `src/app/api/stats/route.ts`

**Interface:**
- Consumes: DailyGoal records (from Task 5), `/api/daily-goal?range=90` (from Task 7)
- Produces: Streak card + heatmap section on stats page

- [ ] **Step 1: Import streak utility and extend stats API with goal data**

In `src/app/api/stats/route.ts`, add import at top:

```ts
import { calculateStreak } from '@/lib/streak'
```

Then add goal and streak fields after the `dailyActivity` computation and before `return NextResponse.json(...)`:

```ts
  // Daily goal heatmap data
  const goalStart = new Date(today)
  goalStart.setDate(goalStart.getDate() - 29)
  const goalRecords = await prisma.dailyGoal.findMany({
    where: { userId, date: { gte: goalStart } },
    orderBy: { date: 'asc' },
  })
  const goalMap = new Map<string, (typeof goalRecords)[0]>()
  for (const r of goalRecords) {
    goalMap.set(r.date.toISOString().split('T')[0], r)
  }
  const goalHeatmap: Array<{
    date: string
    learned: number
    target: number
    completed: boolean
  }> = []
  const d = new Date(goalStart)
  for (let i = 0; i < 30; i++) {
    const key = d.toISOString().split('T')[0]
    const record = goalMap.get(key)
    goalHeatmap.push({
      date: key,
      learned: record?.learned ?? 0,
      target: record?.target ?? 0,
      completed: record?.completed ?? false,
    })
    d.setDate(d.getDate() + 1)
  }

  const streak = await calculateStreak(userId)
```

Then add these fields to the response object:

```ts
  return NextResponse.json({
    overall: { ... },
    masteryDistribution: dist,
    stages,
    weakGroups,
    reviewForecast,
    dailyActivity,
    goalHeatmap,
    streak,
  })
```

- [ ] **Step 2: Add GoalHeatmap type to stats page**

In `src/app/stats/page.tsx`, add to the `Stats` type:

```tsx
  goalHeatmap?: Array<{ date: string; learned: number; target: number; completed: boolean }>
  streak?: { current: number; longest: number }
```

- [ ] **Step 3: Add streak card and heatmap to stats page**

Add after the "Overall progress" card and before "Mastery distribution":

```tsx
      {/* Streak and daily goal */}
      {stats.streak && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">连续打卡</h2>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.streak.current}</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">当前连续</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">{stats.streak.longest}</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">最长连续</p>
            </div>
          </div>
        </div>
      )}

      {/* Goal heatmap */}
      {stats.goalHeatmap && stats.goalHeatmap.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近 30 天打卡</h2>
          <div className="grid grid-cols-15 gap-[3px]" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
            {stats.goalHeatmap.map((d) => {
              let bg = 'bg-stone-100 dark:bg-stone-800'
              if (d.completed) bg = 'bg-emerald-500 dark:bg-emerald-600'
              else if (d.learned > 0 && d.target > 0) {
                const ratio = d.learned / d.target
                if (ratio >= 0.75) bg = 'bg-emerald-300 dark:bg-emerald-700'
                else if (ratio >= 0.5) bg = 'bg-emerald-200 dark:bg-emerald-800'
                else bg = 'bg-emerald-100 dark:bg-emerald-900'
              }
              return (
                <div
                  key={d.date}
                  className={`aspect-square rounded-sm ${bg}`}
                  title={`${d.date}: ${d.learned}/${d.target}`}
                />
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/stats/page.tsx src/app/api/stats/route.ts
git commit -m "feat: add goal heatmap and streak card to stats page"
```

---

## Phase 3: 错词分析

### Task 13: Create review analysis API

**Files:**
- Create: `src/app/api/review/analysis/route.ts`

**Produces:** `GET /api/review/analysis` returning topFailed, lowestMastery, and trend data.

- [ ] **Step 1: Write the API route**

Create `src/app/api/review/analysis/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  try {
    const userId = await getLocalUserId()

    // Top 20 most-failed words
    const failedRaw = await prisma.reviewLog.groupBy({
      by: ['userWordMeaningId'],
      where: {
        result: 'fail',
        reviewSession: { userId },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    const failedIds = failedRaw.map((f) => f.userWordMeaningId)
    const failedDetails = await prisma.userWordMeaning.findMany({
      where: { id: { in: failedIds } },
      include: {
        meaning: { include: { word: true } },
      },
    })
    const failedMap = new Map(failedDetails.map((d) => [d.id, d]))
    const lastFailedRaw = await prisma.reviewLog.groupBy({
      by: ['userWordMeaningId'],
      where: { userWordMeaningId: { in: failedIds }, result: 'fail' },
      _max: { createdAt: true },
    })
    const lastFailedMap = new Map(
      lastFailedRaw.map((f) => [f.userWordMeaningId, f._max.createdAt])
    )

    const topFailed = failedRaw
      .map((f) => {
        const d = failedMap.get(f.userWordMeaningId)
        if (!d) return null
        return {
          userWordMeaningId: f.userWordMeaningId,
          word: d.meaning.word.text,
          partOfSpeech: d.meaning.partOfSpeech,
          definitionCn: d.meaning.definitionCn,
          failCount: f._count.id,
          lastFailedAt: lastFailedMap.get(f.userWordMeaningId),
        }
      })
      .filter(Boolean)

    // Top 20 lowest mastery
    const lowMastery = await prisma.userWordMeaning.findMany({
      where: {
        userWord: { userId },
        interval: { gt: 0 },
      },
      orderBy: [{ mastery: 'asc' }, { easeFactor: 'asc' }],
      take: 20,
      include: { meaning: { include: { word: true } } },
    })
    const lowestMastery = lowMastery.map((m) => ({
      userWordMeaningId: m.id,
      word: m.meaning.word.text,
      partOfSpeech: m.meaning.partOfSpeech,
      definitionCn: m.meaning.definitionCn,
      mastery: m.mastery,
      easeFactor: m.easeFactor,
      nextReviewAt: m.nextReviewAt,
    }))

    // Trend
    const agg = await prisma.userWordMeaning.aggregate({
      where: { userWord: { userId }, interval: { gt: 0 } },
      _avg: { mastery: true, interval: true },
    })
    const avgMastery = Math.round(agg._avg.mastery ?? 0)
    const avgInterval = Math.round((agg._avg.interval ?? 0) * 10) / 10

    // Last 7 days pass rate
    const recentPassRate = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(start.getTime() + 86400000)
      const total = await prisma.reviewLog.count({
        where: {
          reviewSession: { userId },
          createdAt: { gte: start, lt: end },
        },
      })
      const passed = await prisma.reviewLog.count({
        where: {
          reviewSession: { userId },
          createdAt: { gte: start, lt: end },
          result: 'pass',
        },
      })
      recentPassRate.push({
        date: start.toISOString().split('T')[0],
        rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      })
    }

    const needsAttention = await prisma.userWordMeaning.count({
      where: { userWord: { userId }, mastery: { lt: 30 }, interval: { gt: 0 } },
    })

    return NextResponse.json({
      topFailed,
      lowestMastery,
      trend: { avgMastery, avgInterval, recentPassRate, needsAttention },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:3000/api/review/analysis | head -c 500
```
Expected: JSON with `topFailed`, `lowestMastery`, `trend`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/review/analysis/route.ts
git commit -m "feat: add review analysis API"
```

---

### Task 14: Create review analysis page

**Files:**
- Create: `src/app/review/analysis/page.tsx`

**Interface:**
- Consumes: `GET /api/review/analysis` (from Task 13)
- Produces: Summary cards, trend line, topFailed list, lowestMastery list

- [ ] **Step 1: Write the page**

Create `src/app/review/analysis/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'

type Analysis = {
  topFailed: Array<{
    userWordMeaningId: string
    word: string
    partOfSpeech: string
    definitionCn: string | null
    failCount: number
    lastFailedAt: string | null
  }>
  lowestMastery: Array<{
    userWordMeaningId: string
    word: string
    partOfSpeech: string
    definitionCn: string | null
    mastery: number
    easeFactor: number
    nextReviewAt: string
  }>
  trend: {
    avgMastery: number
    avgInterval: number
    recentPassRate: Array<{ date: string; rate: number }>
    needsAttention: number
  }
}

export default function AnalysisPage() {
  const [data, setData] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/review/analysis')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">加载中...</div>
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">暂无数据</div>
  }

  const maxRate = Math.max(...data.trend.recentPassRate.map((d) => d.rate), 10)
  const points = data.trend.recentPassRate
    .map((d, i) => {
      const x = (i / (data.trend.recentPassRate.length - 1 || 1)) * 280
      const y = 50 - (d.rate / maxRate) * 40
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">错词分析</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '平均掌握度', value: `${data.trend.avgMastery}%`, color: 'text-stone-900 dark:text-stone-100' },
          { label: '7天通过率', value: `${data.trend.recentPassRate.length > 0 ? Math.round(data.trend.recentPassRate.reduce((s, d) => s + d.rate, 0) / data.trend.recentPassRate.length) : 0}%`, color: 'text-stone-900 dark:text-stone-100' },
          { label: '需关注词', value: `${data.trend.needsAttention}`, color: data.trend.needsAttention > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Trend line */}
      {data.trend.recentPassRate.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">近7天通过率</h2>
          <svg viewBox="0 0 280 60" className="w-full" style={{ height: '80px' }}>
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              className="stroke-stone-900 dark:stroke-stone-300"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data.trend.recentPassRate.map((d, i) => (
              <circle
                key={d.date}
                cx={(i / (data.trend.recentPassRate.length - 1 || 1)) * 280}
                cy={50 - (d.rate / maxRate) * 40}
                r="3"
                className="fill-stone-900 dark:fill-stone-300"
              />
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-stone-400 dark:text-stone-500">
            <span>{data.trend.recentPassRate[0]?.date?.slice(5)}</span>
            <span>{data.trend.recentPassRate[data.trend.recentPassRate.length - 1]?.date?.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Top failed words */}
      {data.topFailed.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">高频错词 Top 20</h2>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {data.topFailed.map((item) => (
              <div key={item.userWordMeaningId} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {item.word}
                    <span className="ml-1 text-xs font-normal text-stone-400 dark:text-stone-500">{item.partOfSpeech}</span>
                  </p>
                  {item.definitionCn && (
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">{item.definitionCn}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {item.failCount}次
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lowest mastery words */}
      {data.lowestMastery.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-400">掌握度最低 Top 20</h2>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {data.lowestMastery.map((item) => (
              <div key={item.userWordMeaningId} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {item.word}
                    <span className="ml-1 text-xs font-normal text-stone-400 dark:text-stone-500">{item.partOfSpeech}</span>
                  </p>
                  {item.definitionCn && (
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">{item.definitionCn}</p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {item.mastery}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.topFailed.length === 0 && data.lowestMastery.length === 0 && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          还没有足够的复习数据，多做些复习再来查看。
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/review/analysis/page.tsx
git commit -m "feat: add review analysis page"
```

---

### Task 15: Add navigation links

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/review/page.tsx`

**Interface:**
- Consumes: Analysis page exists (from Task 14)

- [ ] **Step 1: Add "分析" nav link in layout**

In `src/app/layout.tsx`, add after the `复习` link:

```tsx
              <a href="/review/analysis" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">分析</a>
```

- [ ] **Step 2: Add link from review complete page**

In `src/app/review/page.tsx`, in the "done" state (复习完成), add a link after the "学新词" button. In the `{done && (...)}` block, add before the closing `</div>` of the button group:

```tsx
          <button onClick={() => router.push('/review/analysis')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">查看错词分析</button>
```

Insert it in the `done` block's button group (after the "学新词" button, before closing `</div>`):

```tsx
          <button onClick={() => router.push('/review/analysis')} className="rounded-lg border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800">错词分析</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/review/page.tsx
git commit -m "feat: add analysis nav link and review-complete link"
```

---

## Verification

After all tasks complete, run full verification:

- [ ] **Build check:**
```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Prisma sync:**
```bash
npx prisma db push
```
Expected: "Your database is now in sync."

- [ ] **Dev server:**
```bash
npm run dev
```
Navigate to:
- `/` — verify daily goal status bar, install banner (may not show on desktop)
- `/settings` — verify "每日目标" tab
- `/stats` — verify streak card + heatmap
- `/review/analysis` — verify analysis page loads
- `/review` — complete review → verify "错词分析" link on done page
- Check DevTools → Application → Manifest (verify PWA manifest loads)
