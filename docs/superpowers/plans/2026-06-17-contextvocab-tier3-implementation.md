# Tier 3: TTS + 导出/打印 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ContextVocab 添加 TTS 发音 (浏览器 + 外部 API 降级) 和词表导出/打印功能。

**Architecture:** TTS 用两层策略 (外部 API 优先, `speechSynthesis` 兜底); 导出页用 `window.print()` + `@media print` + JSON Blob 下载, 无新依赖。

**Tech Stack:** Next.js 16 App Router + Prisma + SQLite + Tailwind CSS 4 + Web Speech API

## Global Constraints

- 所有页面 `'use client'` — 匹配既有模式
- Stone 色系 + dark mode — 所有 UI 用 `dark:` 前缀, Tailwind stone palette
- 零新 npm 依赖 — 不引入 jsPDF、react-pdf、TTS SDK 等
- 单用户本地应用 — 无多用户支持
- Build 命令: `npx next build --webpack`
- API 错误处理: `getLocalUserId()` + try/catch + 泛型错误消息
- 不引入重型图表库 — 所有可视化用 CSS/SVG
- 文件模式: 所有 `.catch(() => {})` 静默吞错是项目既有模式, 保持一致

---

### Task 1: Prisma Schema — ttsConfig 字段

**Files:**
- Modify: `prisma/schema.prisma` (User model)
- Run: `npx prisma db push`

**Interfaces:**
- Produces: User 模型新增 `ttsConfig String? @default("{}")` JSON 字段

- [ ] **Step 1: 修改 Prisma schema**

在 `prisma/schema.prisma` User model 中 `dailyTarget` 后添加:

```prisma
  ttsConfig   String?  @default("{}") // JSON: { provider, baseURL, apiKey, voice }
```

- [ ] **Step 2: 同步数据库**

```bash
cd f:/english_context && npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: 提交**

```bash
cd f:/english_context && git add prisma/schema.prisma && git commit -m "feat: add ttsConfig field to User model"
```

---

### Task 2: TTS Settings API

**Files:**
- Create: `src/app/api/settings/tts/route.ts`

**Interfaces:**
- Consumes: User model `ttsConfig` JSON field
- Produces: `GET /api/settings/tts` → `{ provider, baseURL, hasKey, voice }`
- Produces: `PUT /api/settings/tts` ← `{ provider?, baseURL?, apiKey?, voice? }` → `{ ok: true }`

- [ ] **Step 1: 创建 settings TTS API**

新建 `src/app/api/settings/tts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const config = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}
    return NextResponse.json({
      provider: config.provider || 'browser',
      baseURL: config.baseURL || '',
      voice: config.voice || '',
      hasKey: !!config.apiKey,
    })
  } catch {
    return NextResponse.json({ provider: 'browser', baseURL: '', voice: '', hasKey: false })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { provider, baseURL, apiKey, voice } = await req.json()
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const existing = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}

    if (provider !== undefined) existing.provider = provider
    if (baseURL !== undefined) existing.baseURL = baseURL
    if (apiKey !== undefined) existing.apiKey = apiKey
    if (voice !== undefined) existing.voice = voice

    for (const k of ['provider', 'baseURL', 'apiKey', 'voice']) {
      if (!existing[k]) delete existing[k]
    }

    await prisma.user.update({
      where: { id: userId },
      data: { ttsConfig: JSON.stringify(existing) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/app/api/settings/tts/route.ts && git commit -m "feat: add TTS settings API"
```

---

### Task 3: TTS Proxy API

**Files:**
- Create: `src/app/api/tts/route.ts`

**Interfaces:**
- Consumes: User model `ttsConfig`, 外部 TTS API (OpenAI-compatible)
- Produces: `POST /api/tts` ← `{ text, voice? }` → `Response` (音频流)

- [ ] **Step 1: 创建 TTS proxy API**

新建 `src/app/api/tts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const config = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}

    const { text, voice: voiceParam } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text required' }, { status: 400 })
    }

    const provider = config.provider || 'browser'
    // 如果配置是 browser 模式但走到了此 API, 返回 400
    if (provider === 'browser') {
      return NextResponse.json({ error: 'Browser TTS does not use API' }, { status: 400 })
    }

    // OpenAI TTS 兼容格式
    const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const apiKey = config.apiKey
    const voice = voiceParam || config.voice || 'alloy'

    if (!apiKey) {
      return NextResponse.json({ error: 'TTS API key not configured' }, { status: 400 })
    }

    const response = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('TTS API error:', response.status, errText)
      return NextResponse.json({ error: 'TTS API request failed' }, { status: response.status })
    }

    // 返回音频流
    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('TTS proxy error:', err)
    return NextResponse.json({ error: 'TTS 请求失败' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/app/api/tts/route.ts && git commit -m "feat: add TTS proxy API route"
```

---

### Task 4: PronounceButton 组件

**Files:**
- Create: `src/components/PronounceButton.tsx`

**Interfaces:**
- Produces: `<PronounceButton word={string} />` — 点击播放单词发音
- Consumes: `GET /api/settings/tts` (懒加载 TTS 配置), `POST /api/tts` (外部 API TTS)
- 返回: 小喇叭 SVG 按钮, 或 `null` (浏览器不支持时隐藏)

- [ ] **Step 1: 创建 PronounceButton 组件**

新建 `src/components/PronounceButton.tsx`:

```ts
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type TtsConfig = {
  provider: string
  baseURL: string
  voice: string
  hasKey: boolean
}

export default function PronounceButton({ word }: { word: string }) {
  const [playing, setPlaying] = useState(false)
  const [config, setConfig] = useState<TtsConfig | null>(null)
  const [supported, setSupported] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 检查浏览器是否支持 speechSynthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.speechSynthesis) {
      setSupported(false)
    }
  }, [])

  // 页面切换时停止播放
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const play = useCallback(async () => {
    if (playing) return
    setPlaying(true)

    try {
      // 懒加载 TTS 配置 (仅首次点击)
      if (!config) {
        const res = await fetch('/api/settings/tts')
        if (res.ok) {
          const data = await res.json()
          setConfig(data)
        }
      }

      const cfg = config || { provider: 'browser', baseURL: '', voice: '', hasKey: false }

      if (cfg.provider !== 'browser' && cfg.hasKey) {
        // 外部 API TTS
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: word, voice: cfg.voice || undefined }),
          })
          if (res.ok) {
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => {
              URL.revokeObjectURL(url)
              setPlaying(false)
            }
            await audio.play()
            return
          }
        } catch {
          // API 失败, 降级到浏览器
        }
      }

      // 浏览器 speechSynthesis (兜底)
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel() // 取消上一次
        const utterance = new SpeechSynthesisUtterance(word)
        utterance.lang = 'en-US'
        utterance.rate = 0.9
        utterance.onend = () => setPlaying(false)
        utterance.onerror = () => setPlaying(false)
        window.speechSynthesis.speak(utterance)
      } else {
        setPlaying(false)
      }
    } catch {
      setPlaying(false)
    }
  }, [word, playing, config])

  // 加载中查询 config 可能需要时间, 但 button 始终可用
  if (!supported) return null

  return (
    <button
      onClick={play}
      disabled={playing}
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition ${
        playing
          ? 'text-amber-500 animate-pulse'
          : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800'
      }`}
      title="发音"
      aria-label={`播放 ${word} 发音`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 010 7.07" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19.07 4.93a10 10 0 010 14.14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/components/PronounceButton.tsx && git commit -m "feat: add PronounceButton component with browser + API TTS fallback"
```

---

### Task 5: 设置页 TTS 配置 Tab

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 添加 TTS tab 到设置页**

在 `src/app/settings/page.tsx` 中:

1. tab state 增加 `'tts'` 选项: `const [tab, setTab] = useState<'llm' | 'interests' | 'goal' | 'tts'>('llm')`
2. Tab 按钮栏增加第四个 tab:
   ```tsx
   <button
     onClick={() => setTab('tts')}
     className={...}
   >
     发音
   </button>
   ```
3. 在 `tab === 'goal'` 区块后增加 `tab === 'tts'` 区块:

```tsx
) : tab === 'tts' ? (
  <TtsConfigPanel />
) : (
```

4. 在页面底部 (或同一文件末尾) 新增 `TtsConfigPanel` 组件:

```tsx
function TtsConfigPanel() {
  const [provider, setProvider] = useState('browser')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [voice, setVoice] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changed, setChanged] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testWord, setTestWord] = useState('pronunciation')

  useEffect(() => {
    fetch('/api/settings/tts')
      .then(r => r.json())
      .then(data => {
        setProvider(data.provider || 'browser')
        setBaseURL(data.baseURL || '')
        setVoice(data.voice || '')
        setHasKey(data.hasKey)
      })
      .catch(() => {})
  }, [])

  function markChanged() { if (!changed) setChanged(true) }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, string> = { provider, baseURL, voice }
      if (apiKey) body.apiKey = apiKey
      const res = await fetch('/api/settings/tts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaved(true)
        setChanged(false)
        setHasKey(!!apiKey || hasKey)
        setApiKey('')
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      // 试听: 先存配置再播放
      const body: Record<string, string> = { provider, baseURL, voice }
      if (apiKey) body.apiKey = apiKey
      await fetch('/api/settings/tts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setHasKey(!!apiKey || hasKey)
      setApiKey('')

      if (provider === 'browser' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(testWord)
        u.lang = 'en-US'
        window.speechSynthesis.speak(u)
      } else if (hasKey || apiKey) {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: testWord, voice: voice || undefined }),
        })
        if (res.ok) {
          const blob = await res.blob()
          const audio = new Audio(URL.createObjectURL(blob))
          audio.play()
        }
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-500 dark:text-stone-400">
        配置单词发音。选择"浏览器 TTS"可离线使用, 配置 API 可获得更自然的语音。
      </p>

      {/* TTS Provider */}
      <div>
        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
          TTS 服务
        </label>
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value); markChanged() }}
          className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="browser">浏览器 TTS (Web Speech)</option>
          <option value="openai">OpenAI TTS</option>
          <option value="custom">自定义 API (OpenAI 兼容)</option>
        </select>
      </div>

      {provider !== 'browser' && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              API Base URL
            </label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => { setBaseURL(e.target.value); markChanged() }}
              placeholder={provider === 'openai' ? 'https://api.openai.com/v1' : '输入 API 地址'}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); markChanged() }}
              placeholder={hasKey ? '•••••••• (已设置, 留空不变)' : '输入 API Key'}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              语音 (Voice)
            </label>
            <input
              type="text"
              value={voice}
              onChange={(e) => { setVoice(e.target.value); markChanged() }}
              placeholder="alloy (OpenAI: alloy/echo/fable/onyx/nova/shimmer)"
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
            />
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
      </button>

      {changed && !saved && (
        <p className="text-center text-xs text-amber-600">有未保存的修改</p>
      )}

      <hr className="border-stone-200 dark:border-stone-700" />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">测试发音</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={testWord}
            onChange={(e) => setTestWord(e.target.value)}
            className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
          />
          <button
            onClick={handleTest}
            disabled={testing}
            className="shrink-0 rounded-lg border border-stone-300 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            {testing ? '...' : '试听'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/app/settings/page.tsx && git commit -m "feat: add TTS config tab to settings page"
```

---

### Task 6: 学习页 + 复习页 TTS 集成

**Files:**
- Modify: `src/app/learn/page.tsx`
- Modify: `src/app/review/page.tsx`

- [ ] **Step 1: 学习页加发音按钮**

在 `src/app/learn/page.tsx` 单词标题行 (约 line 117-118):

```tsx
<div className="flex items-center justify-center gap-2">
  <h1 className="text-3xl font-bold">{item.word}</h1>
  <PronounceButton word={item.word} />   {/* ← 加这一行 */}
  <button ...
```

在文件顶部 import:

```tsx
import PronounceButton from '@/components/PronounceButton'
```

- [ ] **Step 2: 复习页加发音按钮**

在 `src/app/review/page.tsx` 找到单词标题区域 (约 line 158-172, sentence 段落前):

在 `sentence` div 上方或内部添加 PronounceButton, 放在单词旁边:

```tsx
{/* sentence */}
<div className="mb-6">
  <div className="mb-2 flex items-center gap-2">
    <span className="text-sm font-medium text-stone-500 dark:text-stone-400">{word}</span>
    <PronounceButton word={word} />
  </div>
  {sentence.text && (
    ...
```

并在文件顶部 import:

```tsx
import PronounceButton from '@/components/PronounceButton'
```

- [ ] **Step 3: 提交**

```bash
cd f:/english_context && git add src/app/learn/page.tsx src/app/review/page.tsx && git commit -m "feat: add PronounceButton to learn and review pages"
```

---

### Task 7: 导出数据 API

**Files:**
- Create: `src/app/api/export/route.ts`

- [ ] **Step 1: 创建导出 API**

新建 `src/app/api/export/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupIds = searchParams.getAll('groupId')

  if (!groupIds.length) {
    return NextResponse.json({ error: 'At least one groupId required' }, { status: 400 })
  }

  const groups = await prisma.wordGroup.findMany({
    where: { id: { in: groupIds } },
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        orderBy: { sortOrder: 'asc' },
        include: {
          word: {
            include: {
              meanings: {
                select: {
                  partOfSpeech: true,
                  definitionCn: true,
                  example: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const result = groups.map((g) => ({
    id: g.id,
    name: g.name,
    words: g.words.map((wi) => ({
      word: wi.word.text,
      meanings: wi.word.meanings.map((m) => ({
        pos: m.partOfSpeech,
        definitionCn: m.definitionCn,
        example: m.example,
      })),
    })),
  }))

  return NextResponse.json({ groups: result })
}
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/app/api/export/route.ts && git commit -m "feat: add export data API"
```

---

### Task 8: 导出页面 + 打印样式

**Files:**
- Create: `src/app/export/page.tsx`
- Create: `src/app/export/export.css`

- [ ] **Step 1: 创建导出页面**

新建 `src/app/export/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import './export.css'

type GroupInfo = { id: string; name: string; total: number; learned: number }
type ExportWord = { word: string; meanings: Array<{ pos: string; definitionCn: string | null; example: string | null }> }
type ExportGroup = { id: string; name: string; words: ExportWord[] }

export default function ExportPage() {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportData, setExportData] = useState<ExportGroup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    fetch('/api/kaoyan/stats')
      .then(r => r.json())
      .then(data => {
        if (data.groups) {
          setGroups(data.groups)
          setSelected(new Set(data.groups.map((g: GroupInfo) => g.id)))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === groups.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(groups.map(g => g.id)))
    }
  }

  async function handlePreview() {
    if (selected.size === 0) return
    setFetching(true)
    try {
      const params = new URLSearchParams()
      selected.forEach(id => params.append('groupId', id))
      const res = await fetch(`/api/export?${params}`)
      const data = await res.json()
      setExportData(data.groups)
    } catch {
      alert('获取词表失败')
    } finally {
      setFetching(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleExportJSON() {
    if (!exportData) return
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), groups: exportData }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contextvocab-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-stone-400">加载中...</div>
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">导出词表</h1>

      {/* 选词面板 — 打印时隐藏 */}
      <div className="print:hidden mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:shadow-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">选择词表范围</h2>
          <button
            onClick={toggleAll}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            {selected.size === groups.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="space-y-2">
          {groups.map(g => (
            <label key={g.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500 dark:border-stone-600"
              />
              <span className="flex-1 text-sm font-medium text-stone-700 dark:text-stone-300">{g.name}</span>
              <span className="text-xs text-stone-400">{g.learned}/{g.total}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handlePreview}
            disabled={selected.size === 0 || fetching}
            className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {fetching ? '加载中...' : `预览词表 (${selected.size} 组)`}
          </button>
        </div>
      </div>

      {/* 词表预览 */}
      {exportData && (
        <div className="space-y-8">
          <div className="print:hidden flex gap-2">
            <button onClick={handlePrint} className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200">
              打印
            </button>
            <button onClick={handleExportJSON} className="flex-1 rounded-lg border border-stone-300 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800">
              导出 JSON
            </button>
          </div>

          {exportData.map(group => (
            <div key={group.id} className="export-group">
              <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-200">{group.name}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.words.map(w => (
                  <div key={w.word} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{w.word}</div>
                    {w.meanings.map((m, i) => (
                      <div key={i} className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        <span className="italic">{m.pos}</span> {m.definitionCn}
                        {m.example && <span className="block mt-0.5 text-stone-400 dark:text-stone-500">— {m.example}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!exportData && !loading && (
        <div className="py-16 text-center text-sm text-stone-400 dark:text-stone-500">
          选择词表范围后点击"预览词表"
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建打印 CSS**

新建 `src/app/export/export.css`:

```css
@media print {
  /* 隐藏非打印元素 */
  header, .print\:hidden {
    display: none !important;
  }

  @page {
    size: A4;
    margin: 15mm 10mm;
  }

  body {
    font-size: 10pt;
    line-height: 1.4;
    color: #000;
    background: #fff;
  }

  .export-group {
    page-break-before: always;
    margin-bottom: 10mm;
  }

  .export-group:first-of-type {
    page-break-before: avoid;
  }

  .export-group h2 {
    font-size: 14pt;
    font-weight: 700;
    margin-bottom: 5mm;
    border-bottom: 1pt solid #ccc;
    padding-bottom: 2mm;
  }

  /* 两列布局 */
  .grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 3mm !important;
  }

  .grid > div {
    break-inside: avoid;
    border: 1pt solid #ddd;
    padding: 2mm 3mm;
    border-radius: 0;
  }

  .grid > div > div:first-child {
    font-size: 11pt;
    font-weight: 600;
  }

  .grid > div > div:last-child {
    font-size: 8pt;
    color: #444;
  }
}
```

- [ ] **Step 3: 提交**

```bash
cd f:/english_context && git add src/app/export/ && git commit -m "feat: add export page with print and JSON export"
```

---

### Task 9: 导航栏添加"导出"链接

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 导航栏加导出链接**

在 `src/app/layout.tsx` 导航按钮区,"设置"前加:

```tsx
<a href="/export" className="...">导出</a>
```

具体在约 line 36 (`<a href="/bookmarks">`) 后:

```tsx
<a href="/bookmarks" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">难词本</a>
<a href="/export" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">导出</a>
<a href="/manual" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">+手动</a>
```

- [ ] **Step 2: 提交**

```bash
cd f:/english_context && git add src/app/layout.tsx && git commit -m "feat: add export link to navigation"
```

---

### Task 10: Build 验证 + 最终提交汇总

- [ ] **Step 1: TypeScript 检查**

```bash
cd f:/english_context && npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 2: Prisma 同步**

```bash
cd f:/english_context && npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Build**

```bash
cd f:/english_context && npx next build --webpack
```

Expected: Build 成功, 无错误

- [ ] **Step 4: 提交 (如有修复)**

```bash
cd f:/english_context && git add -A && git commit -m "fix: address build issues"
```
