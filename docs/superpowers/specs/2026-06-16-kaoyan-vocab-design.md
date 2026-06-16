# ContextVocab 考研英语词库 — 设计文档

## 概述

将 `data/` 中的考研词库（9602 词）导入 ContextVocab，改造为语境驱动的背词体验。保留手动加词功能，首页改为考研词库学习入口。

## 核心理念

- **语境驱动**：展示英文句子（目标词高亮），用户自评理解度后揭示中文释义
- **一个 Meaning + 多条 AI 句子 = 最小学习单元**。多条句子覆盖不同语境，复习时可轮换
- 词库释义按词性分组，按 `；` 拆分为独立子释义
- 每个子释义有独立 SM-2 状态和掌握度
- **全 AI 生成句子**：不用内置句子，避免释义-句子匹配问题

## 数据导入

来源：`json-full/KaoYan_{1,2,3}.json`

### 提取逻辑

```json
{
  "headWord": "revolt",
  "content": {
    "word": {
      "content": {
        "syno": {
          "synos": [
            { "pos": "n", "tran": "反抗；造反，起义" },
            { "pos": "v", "tran": "起义；反抗" }
          ]
        }
      }
    }
  }
}
```

1. 遍历 `syno.synos[]`
2. 每个 `syno` 的 `tran` 按 `；` 拆分为多条 Meaning
   - `"反抗；造反，起义"` → `n. 反抗`，`n. 造反，起义`
3. 词性统一：`n`/`noun`, `v`/`vt`/`vi`/`verb`, `adj`/`adjective`, `adv`/`adverb`
4. 约 465 词无 `syno` 数据：仅导入 Word（无 Meaning），标记 `needs_ai=true`
   - AI 生成时一并补释义 + 句子

### 表结构写入

- `Word` — 词条
- `Meaning` — 子释义，`definition` 存中文释义
- `UserWord` — 全量创建，新增 `mastery` 字段
- `UserWordMeaning` — 全量创建（easeFactor=2.5, interval=0），新增 `mastery` 字段

无新增模型。`GeneratedSentence` 复用现有模型（关联 UserWordMeaning）。

## AI 句子生成

### 策略

批量 AI 生成。每条 UserWordMeaning 至少生成 1 个句子，JSON 中用 `sentences` 数组存储，日后可追加。

### JSON 结构（生成中间文件）

`data/sentences-kaoyan.json`：

```json
{
  "version": 1,
  "generatedAt": "2026-06-16",
  "words": [
    {
      "word": "revolt",
      "meanings": [
        {
          "pos": "n",
          "definitionCn": "反抗",
          "sentences": [
            { "sentence": "The peasants organized a revolt against the oppressive tax system.", "sentenceCn": "农民组织起义反抗压迫性税收制度。" },
            { "sentence": "His speech sparked a revolt among the workers.", "sentenceCn": "他的演讲在工人中引发了反抗。" }
          ]
        },
        {
          "pos": "n",
          "definitionCn": "造反，起义",
          "sentences": [
            { "sentence": "The military quickly crushed the revolt.", "sentenceCn": "军方迅速镇压了起义。" }
          ]
        },
        {
          "pos": "v",
          "definitionCn": "起义；反抗",
          "sentences": [
            { "sentence": "The citizens revolted against the dictator.", "sentenceCn": "公民起义反抗独裁者。" }
          ]
        }
      ]
    }
  ]
}
```

- `sentences` 是数组，日后可追加新句子
- 复习时轮换不同句子，提供多语境体验
- 每个子释义至少 1 句，理想 2-3 句

### 批处理设计

```
每批 30 词（≈120 子释义）
并发 5 路（现有 API 封装支持）
每批 ~5s
总批数 ≈ 9600/30 = 320 批
并发后 ≈ 64 轮 → ~5 分钟
```

### 句子质量要求

- 句子自然，非模板化
- 贴合子释义具体含义（不是笼统造句）
- 目标词高亮标记（用 `**word**` 包裹）
- 无明显语法错误
- 难度适配考研水平
- 后续轮次句子变换语境（生活、学术、新闻、科技等）

### 无释义词处理

AI 生成时先为这些词生成释义（词性+中文），再生成句子。数据写回 Meaning + UserWordMeaning。

### 首次可用体验

导入完成后即跑 AI 生成。首次打开提示"正在生成例句，约 5 分钟"，生成完毕后自动可用。

## 掌握度系统

### 公式

```
Meaning 掌握度 = clamp(easeFactor × 25 + recentGradeBonus)
  grade=4 (清楚) → +10
  grade=2 (模糊) → -5
  grade=0 (忘记) → -15
  最小 0，最大 100

Word 掌握度 = avg(所有子 Meaning 掌握度)
```

### 更新时机

每次自评后：
1. 更新 UserWordMeaning SM-2 参数（easeFactor, interval, nextReviewAt）
2. 重算该 UserWordMeaning mastery
3. 重汇 UserWord mastery

## 学习流程

### 调度

- **继续学习** → 从词库顺序取未学 UserWordMeaning
- **开始复习** → SM-2 调度待复习 UserWordMeaning（nextReviewAt <= now）
- 每日首次打开：先复习，复习完推新词
- 新词按词库逐条子义出现，新旧词不混排
- 复习时同一子释义有多句则轮换展示

### 交互

```
Step 1: 展示英文句子
┌──────────────────────────────────┐
│  revolt             掌握度 65%   │
├──────────────────────────────────┤
│                                  │
│  "The peasants organized a       │
│  revolt against the oppressive   │
│  tax system."                    │
│          ↑ revolt 高亮            │
│                                  │
├──────────────────────────────────┤
│       [✓清楚]  [~模糊]  [✗忘记] │
└──────────────────────────────────┘

Step 2: 点选自评后揭示
┌──────────────────────────────────┐
│  revolt             掌握度 65%   │
├──────────────────────────────────┤
│  n. 反抗            掌握度 65%   │
│                                  │
│  翻译：农民组织起义反抗...        │
│                                  │
│         [继续 → 下一词]          │
└──────────────────────────────────┘
```

- 清楚 → SM-2 grade 4，掌握度 +，间隔延长
- 模糊 → SM-2 grade 2，掌握度微降
- 忘记 → SM-2 grade 0，掌握度降，间隔重置 1 天
- 下次复习此子释义时，换另一句展示

## 首页

```
┌──────────────────────────────┐
│  ContextVocab                │
│                              │
│  考研词库 · 9602 词          │
│  掌握度 ████████░░░ 65%      │
│  今日复习: 23 词              │
│                              │
│  ┌──────────────────────┐   │
│  │  继续学习            │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │  开始复习            │   │
│  └──────────────────────┘   │
│                              │
│  导航: [学习] [复习] [+手动]  │
└──────────────────────────────┘
```

- 进度 = 已学子义数 / 总子义数
- 掌握度 = 已学 Word 平均掌握度
- "+手动" → 复用现有手动加词流程

## 实施步骤

1. Prisma migration: 添加 `mastery` 字段到 UserWord + UserWordMeaning
2. 写 `scripts/import-words.ts`（解析 json-full → Word + Meaning + UserWord + UserWordMeaning）
3. 运行导入脚本
4. 提取词库数据 → `data/words-kaoyan.json`（含所有词+子释义，无句子）
5. AI 批量生成句子 → `data/sentences-kaoyan.json`
6. 写 `scripts/load-sentences.ts`（解析 sentences JSON → GeneratedSentence）
7. 运行加载脚本
8. 改首页 `src/app/page.tsx`（考研词库入口 + 两按钮 + 进度）
9. 写学习页 `src/app/learn/page.tsx`（句子→自评→揭示→SM-2 + 掌握度）
10. 改复习页 `src/app/review/page.tsx`（适配子义级调度 + 句子轮换）
11. 改导航 `src/app/layout.tsx`（加手动加词入口）
12. 验证全流程
