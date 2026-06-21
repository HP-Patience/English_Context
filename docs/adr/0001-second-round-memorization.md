# ADR-0001: 第二轮背诵与重新学习机制

## 状态

已实现

## 日期

2026-06-21

## 背景

原系统仅支持单次学习 + SM-2 间隔复习。学习流严格选取 `mastery=0 AND interval=0` 的完全未学词，一旦用户对某词做出评分（包括"忘记"），该词的 `interval` 设为 1，从此进入复习队列，不再出现在初次背诵流中。复习流只展示 `nextReviewAt <= now` 的到期卡片，按 SM-2 排期。

用户反馈需要两种重学能力：
1. **整组重置** — 学完某词库组后，可主动选择"开始第二轮"，重新走完整组词的背诵流程，同时跟踪轮次进度
2. **低掌握度重学** — Review 页面内按掌握度筛选出薄弱词，以学习形态重新过一遍

## 决策

### 方案：扩展现有 UserWord/UserWordMeaning 模型 + 新 API + UI 扩展

不在数据库层面做复杂的状态机或独立"轮次"表，而是通过增量字段和查询策略实现。

### 关键设计

#### 1. 轮次跟踪字段

`UserWord` 增加 `learnRound: Int @default(0)` — 记录当前轮次。0=初始，1=第一轮完成，2=第二轮，以此类推。每开始一轮新背诵，组内所有关联 UserWord 的 `learnRound += 1`。

优势：无需新建 Round 表，轮次信息天然附着在用户-词关系上，查询高效。

#### 2. 轮次内进度跟踪

`UserWord` 和 `UserWordMeaning` 增加 `lastRatedAt: DateTime?` — 记录该词/释义的最后评分时间。

第 N 轮查询策略：选取 `learnRound >= N` 的词，按 `lastRatedAt ASC NULLS FIRST` 排序。NULL 表示本轮尚未评过，排在前面；非 NULL 表示已评过，靠后排列。这天然实现：
- 刷新页面不丢进度
- 未评词优先展示
- 不依赖额外轮次内偏移量

#### 3. "重新学习"独立 API

新建 `GET /api/relearn`，查询条件：
- `interval > 0`（已经学过）
- `mastery < 60`（掌握度偏低）
- `lastRatedAt < 24h ago`（避免重复刷刚评过的词）
- 按 mastery ASC 排序，上限 50

此 API 与复习队列 API 响应格式一致，前端复用同一套 UI 组件逻辑。

#### 4. 现有学习/评分流程不改动

第二轮背诵和重新学习的评分仍走 `POST /api/kaoyan/learn`，SM-2 参数照常更新。轮次信息仅控制"哪些词出现在学习流中"，不影响复习队列的 SM-2 排期。

### 未选择的方案

- **独立 Round/RoundProgress 表**：过度设计。轮次信息只需记录最大值+进度查询即可，额外的表增加 JOIN 复杂度。
- **UserWord 的 status 字段拓展**：status 已有 learning/reviewing/mastered 三态，再加"round2"等值会导致状态爆炸，且与 SM-2 的 mastery 字段职责重叠。
- **重置 mastery/interval 重新学习**：会丢失历史 SM-2 参数，不利于长期记忆跟踪。本方案保留原有 SM-2 参数，第二轮评分继续调整它们。

### 影响

#### 正面
- 用户可按自己的节奏反复背诵整组词库
- 薄弱词有专门入口集中攻克
- 轮次进度可持久化、可统计
- 不改变已有复习流程，SM-2 排期不受干扰

#### 负面
- 首页词库组统计增加 `currentRound` 字段，API 响应体略增
- 第二轮背诵时 mastery 可能已非零，学习页显示"掌握度"可能让部分用户困惑（需要说明这是基于历史评分的数据）

### 涉及文件

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | UserWord 加 learnRound/lastRatedAt，UserWordMeaning 加 lastRatedAt |
| `src/app/api/kaoyan/learn/route.ts` | GET 支持 `?round=N` 参数；POST 更新 lastRatedAt |
| `src/app/api/kaoyan/learn/start-round/route.ts` | 新建 — 递增词库组轮次 |
| `src/app/api/kaoyan/stats/route.ts` | 每组返回 currentRound |
| `src/app/api/relearn/route.ts` | 新建 — 低掌握度词队列 |
| `src/app/learn/page.tsx` | 轮次指示器 + 完成页"开始下一轮"按钮 |
| `src/app/review/page.tsx` | 新增"重新学习"tab |
| `src/app/page.tsx` | 每组显示当前轮次信息 |
