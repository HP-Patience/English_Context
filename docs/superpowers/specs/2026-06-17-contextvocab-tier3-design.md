# Tier 3: 发音 (TTS) + 导出/打印

- **日期:** 2026-06-17
- **项目:** ContextVocab — 考研英语词汇学习应用
- **技术栈:** Next.js 16 App Router + Prisma + SQLite + Tailwind CSS 4

---

## 1. 发音 (TTS)

### 1.1 概述

学习页 (`/learn`) 和复习页 (`/review`) 添加发音按钮，点击播报单词读音。

### 1.2 TTS 策略：两层降级

| 优先级 | 方式 | 条件 |
|--------|------|------|
| 首选 | 外部 TTS API（如 OpenAI TTS） | 用户在设置中配置 |
| 降级 | `speechSynthesis` (Web Speech API) | 浏览器内置，零配置兜底 |

运行时自动检测：有 API 配置 → 调 API → 失败则回退浏览器。

### 1.3 PronounceButton 组件

新建 `src/components/PronounceButton.tsx`

**Props:**
- `word: string` — 要播放的单词

**行为:**
- 点击时根据当前 TTS 配置选择播放方式
- 播放中显示加载态（小喇叭图标波动画）
- 连续点击 → 取消上一个再播
- `speechSynthesis` 不可用 → 按钮隐藏

**UI:**
- 小喇叭 SVG 图标按钮，stone 色系
- 放在单词标题右侧，与书签按钮对称

### 1.4 设置页 TTS 配置

设置页 (`/settings`) 新增 tab: `tts`，在"每日目标"之后。

配置项:
- **TTS Provider**: 下拉选择 `Browser (Web Speech)` / `OpenAI TTS` / `Custom API`
- **API Base URL**: 输入框（仅 Custom API 显示）
- **API Key**: 密码输入框
- **Voice**: 可选语音名称（仅 Custom API）
- **测试发音**: 输入测试文字 → 试听按钮

存储: User model 新增 `ttsConfig String? @default("{}")` JSON 字段。

### 1.5 API 路由

新建 `src/app/api/tts/route.ts`

`POST /api/tts`
```ts
// Request: { text: string, voice?: string }
// Response: Audio 流（外部 API 代理）
// 逻辑: 读用户 ttsConfig → 调对应 API → 返回音频
```

仅在有外部 API 配置时可用。浏览器 `speechSynthesis` 模式不经过此路由。

### 1.6 修改文件

| 文件 | 变动 |
|------|------|
| `prisma/schema.prisma` | User 模型加 `ttsConfig String?` |
| `src/components/PronounceButton.tsx` | 新建 |
| `src/app/settings/page.tsx` | 加 TTS tab |
| `src/app/api/settings/tts/route.ts` | 新建，TTS 配置 CRUD |
| `src/app/api/tts/route.ts` | 新建，TTS API 代理 |
| `src/app/learn/page.tsx` | 在单词标题右侧加 PronounceButton |
| `src/app/review/page.tsx` | 在单词标题右侧加 PronounceButton |

---

## 2. 导出/打印

### 2.1 概述

新建 `/export` 页面，选词范围 → 预览词表 → 打印或导出 JSON。
导航栏加"导出"链接（在"设置"旁）。

### 2.2 页面结构

`src/app/export/page.tsx`（`'use client'`）

**三步骤流程:**

1. **选词范围**
   - 列出所有 WordGroup（高频词、中频词等），带复选框
   - 全选 / 取消全选按钮
   - 已选数量统计

2. **预览词表**
   - 卡片式列表，一行一词
   - 每词显示: 单词 + 音标（如有）+ 释义 + 例句
   - 按 WordGroup 分组，每组有分组标题

3. **操作**
   - **打印**: `window.print()`，触发 `@media print` CSS
   - **导出 JSON**: 前端组装 JSON 文件 → `Blob` → `URL.createObjectURL` 触发下载

### 2.3 打印样式

新建 `src/app/export/export.css`，通过 `@media print` 控制:

- 隐藏导航栏、选词面板、按钮区域
- A4 纸大小，两列布局（节省纸张）
- 每组从新页开始（`page-break-before: always`）
- 页眉: 分组名称 + 导出日期
- 字体: 小号但清晰，适配打印

### 2.4 JSON 导出格式

```json
{
  "name": "高频词",
  "exportedAt": "2026-06-17T00:00:00.000Z",
  "groups": [
    {
      "name": "高频词 Word List 1",
      "words": [
        { "word": "abandon", "pos": "v.", "definitionCn": "放弃", "example": "..." }
      ]
    }
  ]
}
```

### 2.5 数据来源

直接从 API 获取:
- `GET /api/words?groupId=X` — 现有路由，按分组取词
- 前端遍历选中分组，组装预览数据

无需新建 API 路由。

### 2.6 修改文件

| 文件 | 变动 |
|------|------|
| `src/app/export/page.tsx` | 新建 |
| `src/app/export/export.css` | 新建，打印样式 |
| `src/app/layout.tsx` | 导航加"导出"链接 |

---

## 3. Prisma Schema 变更

```prisma
model User {
  // ... 现有字段
  ttsConfig String?  @default("{}") // JSON: { provider, baseURL, apiKey, voice }
}
```

---

## 4. 边界情况

### TTS
- 浏览器不支持 `speechSynthesis` → PronounceButton 隐藏
- API 请求超时/失败 → 静默降级到浏览器 TTS
- 快速多次点击 → 取消旧播放，只播最新一次
- 页面切换 → `speechSynthesis.cancel()` 停止播放

### 导出
- 未选任何分组 → 显示提示，阻止打印/导出
- 空分组（无词数据） → 跳过
- 打印预览尺寸异常 → `@page { size: A4; margin: ... }` 固定
- JSON 导出大文件 → 直接下载不会阻塞 UI

---

## 5. 不涉及变更

- 不变更现有 API 路由（除 TTS 新增外）
- 不修改现有学习/复习流程逻辑
- 不新增外部 npm 依赖
- 不触及多用户支持

---

## 6. 构建验证

```bash
npx tsc --noEmit        # TypeScript 零错误
npx prisma db push      # 数据库同步
npx next build --webpack # Build 通过
```
