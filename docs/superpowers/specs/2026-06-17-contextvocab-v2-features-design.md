# ContextVocab v2 — 功能增强设计

## 概述

基于 ContextVocab v1（考研英语词汇闪过 6098 词，SM-2 间隔重复，AI 释义+例句），v2 增加 4 个功能：搜索&词典、学习统计看板、收藏/难词本、深色模式。目标用户为单用户考研备考，每日 30-60 分钟，电脑/手机双端使用。

## 1. 搜索 & 词典

**目标:** 全局搜索入口，快速查词，无需打断学习流。

**交互:**
- Layout 级搜索框（顶部导航栏右侧），输入即搜
- 搜索页 `/search?q=<keyword>` 展示结果列表
- 每个结果项：单词、词性、释义、AI 例句（已生成例句优先展示）、当前掌握状态
- 搜索结果中已学的词可跳转复习，未学的可直接"加入学习队列"

**数据:**
- 搜索后端 API `GET /api/search?q=<keyword>`，对 Word.text 做 LIKE 查询（或 SQLite FTS5，视数据量决定）
- 返回匹配的词 + 关联 Meaning 和最后一句话 + 当前用户掌握状态
- 模糊匹配：精确前缀 > 子串 > 中文释义匹配

**实现约束:**
- 不引入外部搜索服务
- 搜索延迟需 < 200ms 本地查询保障流畅
- 搜索结果页保持移动端响应式

## 2. 学习统计看板

**目标:** 让用户了解学习进度、薄弱环节、预估完成时间，辅助制定复习策略。

**页面:** 独立 `/stats` 页面，或首页第二个 tab（推荐独立页面，不影响首页简洁性）。

**指标:**
- **总体进度** — 已学词数/总词数、掌握率分布（0-25% / 25-50% / 50-75% / 75-100%）
- **各阶段进度** — 高频/中频/低频/偶考/基础/补充 各阶段掌握率横向对比
- **薄弱分组** — 掌握率最低的 5 个分组自动高亮，直接可跳转学习
- **复习负载预测** — 未来 7 天每天待复习词数（基于 UserWordMeaning.nextReviewAt）
- **学习记录** — 每日学习词数（基于 ReviewLog），展示最近 30 天趋势

**技术:**
- API `GET /api/stats` 聚合现有数据：
  - `UserWordMeaning.nextReviewAt` → 复习负载
  - `ReviewLog.createdAt` → 每日学习量
  - `UserWordMeaning.mastery` → 掌握率
- 可视化：纯 CSS 柱状图 + 进度条，不引入图表库
- 新增模型字段：无，全部基于现有 Schema 聚合

**数据结构示例 (API 返回):**
```json
{
  "overall": { "totalWords": 6098, "learnedWords": 3050, "avgMastery": 58 },
  "stages": [
    { "name": "高频词", "total": 832, "learned": 720, "avgMastery": 72 }
  ],
  "weakGroups": [
    { "id": "g1", "name": "基础词 Word List 8", "avgMastery": 23 }
  ],
  "reviewForecast": [
    { "date": "2026-06-18", "dueCount": 45 }
  ],
  "dailyActivity": [
    { "date": "2026-06-10", "count": 32 }
  ]
}
```

## 3. 收藏/难词本

**目标:** 标记需要特别关注的词，独立复习入口。

**数据模型变更:**
- `UserWord` 表新增 `bookmarked` 字段，Boolean，默认 false（Prisma migration）

**交互:**
- 学习页、复习页卡片右上角加星标按钮（⭐/☆）
- 点击切换收藏状态，即时反馈
- 独立 `/bookmarks` 页面：
  - 列表展示所有收藏词，按收藏时间倒序
  - 可筛选：按分组/阶段
  - 每个词可直接进入学习/复习
  - 支持取消收藏
- 首页增加"难词本"入口

**API:**
- `POST /api/bookmarks/toggle` — 切换收藏状态
- `GET /api/bookmarks` — 获取收藏列表（含筛选参数）
- `POST /api/bookmarks/review` — 对收藏词启动复习会话

## 4. 深色模式

**目标:** 夜间使用舒适，系统偏好自动启用，手动可切换。

**实现:**
- CSS 方案：Tailwind `darkMode: 'class'`，通过 `<html>` 上 `dark` class 切换
- 存储偏好到 `localStorage`，初始化时读取；未设置时跟随 `prefers-color-scheme`
- Layout 加主题切换按钮（🌙/☀️），三态：跟随系统 / 浅色 / 深色
- 各页面颜色适配：
  - 背景白色 → `dark:bg-stone-900`，次级背景 `dark:bg-stone-800`
  - 文字黑色 → `dark:text-stone-100`，次级文字 `dark:text-stone-400`
  - 边框 `dark:border-stone-700`
  - 高亮色（amber 系列）保持，加深背景对比度
  - 阴影消除，替换为边框

**覆盖范围:** 首页、学习页、复习页、设置页、搜索页、统计页、难词本页

## 不做的功能

- 多用户/登录（单用户）
- 发音 TTS（优先级低）
- 导出/打印
- 社区/社交功能
- 自定义词表导入

## 构建顺序

1. 深色模式（最小改动，结构影响大，先做以便后续页面直接适配）
2. 搜索 & 词典
3. 收藏/难词本
4. 统计看板（依赖最多数据，最后做）

## 技术考量

- 所有功能无需新增 npm 包（搜索用 SQLite LIKE，图表用 CSS）
- 数据库 migration 仅 1 次（bookmarked 字段）
- 搜索和统计 API 复用现有 Prisma 查询模式
- 移动端适配：所有页面已基于 `max-w-lg` 约束，搜索和统计页面继续保持
