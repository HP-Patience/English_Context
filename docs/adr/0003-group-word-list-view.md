# ADR-003: 单词分组列表页

## 状态

Accepted

## 日期

2026-06-21

## 背景

首页按阶段（高频/中频/低频等）折叠展示 118 个 WordGroup，用户可点击某组进入 `/learn` 逐个学习。但**无法查看某组内所有单词概览**，也无法通过列表直接跳转到单词详情页。

现有入口中：
- 搜索页 `/search` → `word/[id]` ✓
- 收藏本 `/bookmarks` → `word/[id]` ✓
- 学习页 `/learn`：单次只展示一个单词，无列表概览 ✗
- 复习页 `/review`：同 ✗
- 首页 `/`：仅展示组名和进度条，无单词列表 ✗

用户需要能看到某组下所有单词，并点击进入详情页。

## 决策

新增"单词列表页" + 对应 API，并在首页添加入口。

### 新增 API

`GET /api/groups/[id]/words`

复用学习 API 中 `WordGroupItem.findMany` 的 Prisma 查询模式（`learn/route.ts:20-39`），但**移除"只取第一个未学"的过滤逻辑**，直接返回该组全部单词及学习状态。

选择复用现有查询链而非写原生 SQL，原因：
- 与 learn API 数据一致性有保障
- UserWord 上已包含 mastery/status/bookmarked 字段，无需额外查询
- 用 `include.meanings.take: 1` 控制只取第一个释义，避免 N+1

### 新增页面

`/list/[groupId]` — 'use client' 实现。

关键 UI 决策：
- 卡片列表布局：每词一行卡片（`rounded-xl border p-4`），复用 word 详情页的 style token
- 内容：单词文本 + PronounceButton + 词性/中文释义 + 掌握度标签 + 收藏状态 + 右箭头
- 点击卡片 → 路由跳转到 `/word/[id]` 详情页（`<Link>` 而非 `router.push`，便于浏览器 PWA 体验）
- 顶部："开始学习"按钮（`/learn?groupId=X`）+"返回"按钮

掌握度标签和颜色逻辑直接从 word 详情页复制（`masteryLabel`/`masteryColor`），保持视觉一致性。

### 首页入口

每组按钮右侧加分隔线和"列表"文字链接。

用 `<div className="flex items-stretch">` 包裹原有 button 和新增 Link，而非修改 button 内部布局，保持学习按钮原有行为不变。

## 影响

正面：
- 用户可浏览任意分组全部单词，建立全局认知
- 从列表直达详情页，补全了之前缺失的导航路径
- 仅 3 处改动，最小侵入
- API 复用 existing Prisma query，无新依赖

负面：
- 小组（如"补充词 K"仅 4 词）列表页内容单薄，但页面结构一致
- API 返回全量列表，大组（如 233 词）首屏加载稍慢，后续可通过分页优化（当前无此需求，不过度设计）

## 替代方案

1. **在首页直接展所有单词** — 不可行，首页已有 118 组，全部展开数据量过大
2. **改造 `/learn` 页添加列表模式** — 学习页有复杂的轮次和自评状态机，耦合过重
3. **模态框展示列表** — 小屏体验差，PWA 场景下导航不自然

## 相关文件

- `src/app/api/groups/[id]/words/route.ts` — 新增 API
- `src/app/list/[groupId]/page.tsx` — 新增列表页
- `src/app/page.tsx` — 首页添加列表入口
- `src/app/api/kaoyan/learn/route.ts` — 查询模式参考来源
- `src/app/word/[id]/page.tsx` — UI 风格参考来源
