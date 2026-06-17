# Tier 2 Feature Spec: PWA + 每日目标打卡 + 错词分析

**日期:** 2026-06-17
**状态:** 待实现
**上下文:** ContextVocab v1 已完成 Tier 1 (搜索词典、统计看板、收藏难词本、深色模式)，现推进 Tier 2 三个功能。

---

## 功能概览

| 功能 | 核心价值 | 复杂程度 |
|------|---------|---------|
| PWA | 手机安装到桌面，离线可用 | 低 — 配置 + SW |
| 每日目标打卡 | 设定目标 + 连续天数 + 热力图 | 中 — 新模型 + 新页面 |
| 错词分析 | 薄弱词发现 + 复习趋势 | 中 — 聚合查询 + 新页面 |

**实现顺序:** PWA → 每日目标打卡 → 错词分析

---

## 1. PWA

### 1.1 目标

手机上能安装到桌面（Add to Home Screen），离线时核心页面可用。

### 1.2 技术方案

使用 `@serwist/next`（Next.js 16 兼容，`next-pwa` 已停止维护）。

### 1.3 组件

#### 1.3.1 Web Manifest

`public/manifest.json`:
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

#### 1.3.2 Service Worker

使用 @serwist/next 的默认配置:
- **静态资源** (JS/CSS/字体): Cache-First，缓存 30 天
- **API 请求**: Network-First，失败时回退到缓存
- **最大缓存**: 50MB

#### 1.3.3 安装提示

首页底部 banner:
- 仅在 PWA 未安装 + 浏览器支持时显示
- 文案: "添加到主屏幕，随时随地背单词"
- 一个关闭按钮（关闭后 7 天内不再显示）

#### 1.3.4 图标

生成 192x192 和 512x512 PNG 图标，内容为📚书本 + "V" 字母组合。

### 1.4 改动范围

| 操作 | 文件 |
|------|------|
| 新增 | `public/manifest.json` |
| 新增 | `public/icon-192.png`, `public/icon-512.png` |
| 修改 | `next.config.ts` — 加 @serwist/next 配置 |
| 修改 | `src/app/layout.tsx` — 加 `<link rel="manifest">`, `<meta name="theme-color">` |
| 修改 | `src/app/page.tsx` — 加安装提示 banner |

### 1.5 不做

- 推送通知（无使用场景）
- 后台同步（SQLite 是本地数据库，无需同步）
- 离线全量缓存（6098 词数据由 SW 运行时缓存即可）

---

## 2. 每日目标打卡

### 2.1 目标

用户设定每日目标词数，完成学习/复习后自动记录进度，首页展示今日进度和连续天数，统计页展示历史热力图。

### 2.2 数据模型

```prisma
model DailyGoal {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime // 仅日期部分，存储当天 00:00
  target    Int      // 当日目标词数
  learned   Int      @default(0) // 当日学新词数
  reviewed  Int      @default(0) // 当日复习词数
  completed Boolean  @default(false)

  @@unique([userId, date])
  @@index([userId])
}
```

目标设置存 `User` 表新增字段 `dailyTarget Int @default(30)`。

### 2.3 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/daily-goal` | 获取今日目标 + 进度 |
| GET | `/api/daily-goal?range=30` | 获取近 30 天数据（热力图用） |
| POST | `/api/daily-goal` | 更新每日目标设置 `{target: 30}` |

学习/复习 API 调用时自动 upsert 当日 `DailyGoal` 记录（+1 learned 或 +1 reviewed），当日 learned >= target 时设 `completed = true`。

### 2.4 UI

#### 2.4.1 首页状态条

替换当前的静态进度条，改为今日目标进度:
```
🔥 连续 7 天 · 今日 18/30 词 · 已复习 5 词
[========>         ] 60%
```

#### 2.4.2 统计页 `/stats`

三区块:
1. **连续天数卡片** — 大数字显示连续天数 + 最长连续记录
2. **目标进度** — 今日进度环或进度条
3. **热力图** — 近 30 天/90 天网格，每个格子代表一天，颜色深浅表示完成度。用纯 CSS grid 实现，不引入图表库

#### 2.4.3 设置入口

在 `/settings` 页面加 "每日目标" 设置项: 数字输入框 + 保存按钮。

### 2.5 连续天数计算

```
从今天往回遍历 DailyGoal 记录:
  if date[i].completed: streak++
  else if date[i] == today: 不管（今天可能还没完成）
  else: break
```

### 2.6 改动范围

| 操作 | 文件 |
|------|------|
| 修改 | `prisma/schema.prisma` — 加 DailyGoal 模型 |
| 新增 | `src/app/api/daily-goal/route.ts` |
| 新增 | `src/lib/streak.ts` — 连续天数计算等纯函数 |
| 修改 | `src/app/api/stats/route.ts` — 加 dailyGoal、streak 字段（已有此文件） |
| 修改 | `src/app/stats/page.tsx` — 加每日目标 + 热力图区块（已有此文件） |
| 修改 | `src/app/page.tsx` — 首页状态条改为今日目标进度 |
| 修改 | `src/app/settings/page.tsx` — 加每日目标设置 |
| 修改 | `src/app/api/kaoyan/learn/route.ts` — POST 时 upsert DailyGoal |
| 修改 | `src/app/api/review/submit/route.ts` — POST 时 upsert DailyGoal |

---

## 3. 错词分析

### 3.1 目标

从 ReviewLog 中聚合薄弱词数据，帮助用户针对性复习。

### 3.2 无需新数据模型

全部基于现有 `ReviewLog` 和 `UserWordMeaning` 查询聚合。

### 3.3 API

`GET /api/review/analysis` 返回:
```json
{
  "topFailed": [
    {
      "userWordMeaningId": "...",
      "word": "ambiguous",
      "partOfSpeech": "adj.",
      "definitionCn": "模棱两可的",
      "failCount": 12,
      "lastFailedAt": "2026-06-15T..."
    }
  ],
  "lowestMastery": [
    {
      "userWordMeaningId": "...",
      "word": "scrutinize",
      "mastery": 15,
      "easeFactor": 1.8,
      "nextReviewAt": "2026-06-18T..."
    }
  ],
  "trend": {
    "avgMastery": 62.5,
    "avgInterval": 4.2,
    "recentPassRate": [
      { "date": "2026-06-10", "rate": 0.82 },
      { "date": "2026-06-11", "rate": 0.75 }
    ],
    "needsAttention": 34
  }
}
```

### 3.4 页面 `/review/analysis`

#### 3.4.1 顶部摘要卡片 (3 列)

| 平均掌握度 | 7 天通过率 | 需关注词数 |
|-----------|-----------|-----------|
| 62.5%     | 78%      | 34 词     |

#### 3.4.2 复习趋势图

简单折线图，最近 7 天每日 pass rate。用 SVG `<polyline>` 手画，不引入图表库。

#### 3.4.3 高频错词 Top 20

表格列表 — 词、释义、失败次数、最后失败时间。点击展开该词的失败时间线。

#### 3.4.4 掌握度最低 Top 20

表格列表 — 词、掌握度%、easeFactor、下次复习时间。每行右侧 "复习" 按钮。

### 3.5 改动范围

| 操作 | 文件 |
|------|------|
| 新增 | `src/app/api/review/analysis/route.ts` |
| 新增 | `src/app/review/analysis/page.tsx` |
| 修改 | `src/app/review/page.tsx` — 复习完成页加 "查看错词分析 →" 链接 |
| 修改 | `src/app/layout.tsx` — 导航栏加 `<a href="/review/analysis">分析</a>` |

### 3.6 数据查询要点

- **topFailed**: 聚合 `ReviewLog` 按 `userWordMeaningId` 分组，`result = 'fail'`，按 failCount DESC，JOIN Meaning + Word 获取词信息
- **lowestMastery**: 直接查 `UserWordMeaning` 按 `mastery ASC, easeFactor ASC`，JOIN 同上，过滤 `interval > 0`（仅已学过）
- **trend.avgMastery**: `SELECT AVG(mastery) FROM UserWordMeaning WHERE userWord.userId = ? AND interval > 0`
- **trend.recentPassRate**: 最近 7 天每天 `SELECT COUNT(*) WHERE result='pass' / COUNT(*) FROM ReviewLog GROUP BY date`
- **trend.needsAttention**: `COUNT WHERE mastery < 30 AND interval > 0`

---

## 4. 通用约束

### 4.1 技术约束

- 不引入重型图表库（热力图和折线图用 CSS/SVG 手画）
- 匹配项目现有风格: Tailwind + stone 色系 + 无动画 + dark mode (`dark:` 前缀类)
- 所有页面 `'use client'`（匹配现有模式）
- API 遵循现有错误处理模式: try/catch + 返回泛型错误信息，使用 `getLocalUserId()` 获取用户
- 不引入新依赖（除 PWA 功能的 `@serwist/next`）

### 4.2 不在此范围

- 多用户支持（用户明确表示自用）
- 测验模式（用户明确去除）
- 推送通知
- 数据导出/导入
- 发音 TTS

### 4.3 实现顺序

1. **PWA** — 基础设施，先做，完成后手机体验质变
2. **每日目标打卡** — 有 DailyGoal 模型，学习/复习 API 需感知
3. **错词分析** — 纯查询，依赖 ReviewLog 现有数据

每个功能独立 PR，完成后可单独测试和部署。
