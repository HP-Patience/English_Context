# 《蛊真人》连续故事四步背词功能设计

- **日期**：2026-08-21
- **状态**：设计稿，待用户审阅
- **相关项目**：ContextVocab

## 1. 背景

当前项目已经具备考研词库、词义、例句、按分组学习和 SM-2 复习能力，但首次学习主要以单词卡片为中心。目标功能是在现有系统中增加一个独立的“小说故事学习”模式：以 `蛊真人.txt` 的完整主线为素材，将 6098 个词组织成一套连续的中文故事课程，并在每篇故事中嵌入英文目标词。

用户希望看到的不是互不相关的句子，而是一条从小说开头推进到结尾的连续叙事，最终控制在约 80～100 篇，硬上限 150 篇。每篇最多包含 100 个目标词。

## 2. 已确认的产品决策

### 2.1 故事素材

- 使用本地文件 `F:\english_context\蛊真人.txt`。
- 文件当前为 GB18030 编码，预处理脚本需要显式按 GB18030 解码。
- 故事课程基于原著人物、世界观、事件和时间线进行中文改写，不把整本小说原文直接加载到浏览器或数据库。
- 原文只作为本地生成素材；数据库保存生成后的学习内容和来源章节范围。

### 2.2 故事规模

- 目标：约 80～100 篇。
- 允许范围：50～150 篇。
- 硬上限：150 篇。
- 为覆盖全部 6098 个词，课程实际不能少于约 61 篇；因此生成器以“覆盖全部词 + 保持连贯”为优先，最终数量可能落在 61～150 篇之间。
- 每篇最多 100 个目标词，建议通常为 60～80 个；剧情转折处可以少于建议值。
- 目标词按现有 `WordGroup` 顺序优先分配，但不为了塞入单词而破坏剧情。每个词至少有一次作为目标词被分配到某篇故事；词在正文中可以自然重复出现。

### 2.3 学习流程

每篇故事包含四步：

1. **Step1：在语境中背单词**
   - 显示连续的中文故事。
   - 目标英文词嵌入句子中，并显示本篇语境中文释义。
2. **Step2：看语境回忆词义**
   - 英文词保留，中文释义隐藏。
   - 用户先自行回忆，再显示答案并进行自评。
3. **Step3：单词列表复习**
   - 显示本篇全部目标词、音标、词性、释义和故事用法。
4. **Step4：强化复习**
   - 每个目标词有 1～5 轮复习记录。
   - 五轮不是一次性完成，按到期复习逐轮完成。
   - 完成 Step3 后即可进入下一篇，不被 Step4 阻塞。

Step4 的释义交互：

- 默认隐藏。
- 鼠标悬停临时显示；离开后，如果没有锁定则重新隐藏。
- 点击一次显示并保持显示。
- 再次点击隐藏。
- 移动端没有 hover，采用点击切换显示/隐藏。
- 键盘聚焦时显示，Enter/Space 切换锁定状态。
- 显示/隐藏只影响界面，不等于记忆结果；“记得 / 模糊 / 忘记”才写入复习记录。

### 2.4 与现有学习模式的关系

- 保留现有 `/learn` 普通词卡学习模式。
- 新增独立的 `/story` 故事学习模式。
- 普通模式和故事模式共享现有 `Word`、`Meaning`、`UserWord`、`UserWordMeaning` 数据。
- 故事 Step4 的结果同步到现有 SM-2 长期复习调度，但故事五轮记录本身独立保存。

## 3. 整体架构

```text
蛊真人.txt（GB18030）
        │
        ▼
小说预处理
- 清理网站头尾、广告、无关信息
- 识别章节标题和顺序
- 按章节/段落切分
- 建立人物、事件、时间线索引
        │
        ▼
完整故事规划
- 生成全书主线摘要
- 保留人物和势力关系
- 标记关键转折和伏笔
- 规划 61～150 个连续课程单元
        │
        ▼
课程生成
- 按 WordGroup 顺序分配目标词
- 选择对应情节区间
- 生成中文剧情改写
- 嵌入目标英文词和语境释义
- 结构化输出
        │
        ▼
质量校验
- 词覆盖
- 课程数量
- 章节顺序
- 前后衔接
- JSON/schema
        │
        ▼
PostgreSQL / Prisma
        │
        ├── /story
        ├── /story/[lessonId]
        └── /api/story/*
```

不在用户学习时调用 AI 生成故事。故事课程通过可断点续跑的脚本预生成，学习页面只读取数据库。

## 4. 小说处理和故事生成

### 4.1 预处理

新增本地脚本，职责分离：

- `scripts/parse-novel.mjs`
  - 使用 GB18030 读取小说。
  - 清理下载站头尾、广告、目录和无关元数据。
  - 识别章节标题。
  - 输出章节索引、文本偏移、章节摘要输入。
- `scripts/build-story-outline.mjs`
  - 分批处理全书，不把 12.7 MB 全部放入一次模型请求。
  - 建立人物、势力、重要事件、时间线和章节摘要。
  - 生成连续主线大纲。
- `scripts/generate-story-lessons.mjs`
  - 读取主线大纲和按序目标词。
  - 选择一个或多个相邻章节范围。
  - 生成一篇连续故事课程。
  - 支持批次、进度文件、失败重试和断点续跑。
- `scripts/validate-story-lessons.mjs`
  - 对生成结果做全量静态校验。
  - 输出缺词、重复分配、章节倒退、超限和格式错误报告。

### 4.2 生成输入

每篇生成至少包含：

- 上一篇结尾摘要。
- 当前情节区间摘要。
- 下一篇开头方向或悬念。
- 当前目标词列表。
- 词义、词性和可用释义。
- 全局人物/势力/世界观约束。

### 4.3 生成输出

生成器输出结构化 JSON，而不是直接保存一整段不可解析文本：

```json
{
  "title": "Story 01：青茅山的重生",
  "order": 1,
  "sourceChapterStart": "...",
  "sourceChapterEnd": "...",
  "sourceSummary": "...",
  "continuityNotes": "...",
  "paragraphs": [
    {
      "sceneTitle": "...",
      "segments": [
        { "type": "text", "value": "..." },
        {
          "type": "targetWord",
          "word": "dorm",
          "definitionCn": "宿舍",
          "wordOrder": 1
        }
      ]
    }
  ]
}
```

目标词片段使用结构化标记，避免通过字符串替换导致同词多次出现、大小写和词形错误。

### 4.4 生成质量约束

每篇课程必须满足：

- 目标词数量不超过 100。
- 所有该篇分配的目标词至少出现一次。
- 目标词来自现有 `Word` 表。
- 每个目标词有本篇语境释义。
- 故事情节来自当前章节范围，章节顺序不能倒退。
- 与上一篇和下一篇的连续性摘要存在。
- 不是孤立例句集合，而是连续的中文叙事。
- 生成失败时标记为 `failed`，不进入用户课程列表。

## 5. 数据模型

在现有 Prisma schema 上新增：

### `StoryLesson`

```text
id
order
title
wordGroupId?
sourceChapterStart
sourceChapterEnd
sourceSummary
continuityNotes
contentJson
status                 draft | ready | failed
generationError?
generatedAt
createdAt
updatedAt
```

### `StoryLessonWord`

```text
id
lessonId
wordId
meaningId
sortOrder
glossCn
createdAt
```

约束：同一篇课程内同一目标词只分配一次，但正文允许多次引用同一个目标词片段。

### `UserStoryProgress`

```text
id
userId
lessonId
currentStep             1 | 2 | 3 | 4
status                  not_started | learning | first_passed | reviewing | reinforced
step1CompletedAt?
step2CompletedAt?
step3CompletedAt?
completedAt?
updatedAt
```

### `UserStoryWordProgress`

```text
id
userId
lessonWordId
reviewRoundCompleted    0～5
nextReviewAt?
lastResult?
lastReviewedAt?
```

### `StoryReviewAttempt`

```text
id
userId
lessonWordId
round                    1～5
result                   remembered | vague | forgotten
createdAt
```

所有用户级模型增加必要的唯一约束和索引，例如：

- `(userId, lessonId)` 唯一
- `(userId, lessonWordId)` 唯一
- `(userId, lessonWordId, round)` 唯一
- `nextReviewAt` 索引
- `lesson.order` 索引

## 6. 页面和 API

### 页面

- `/story`
  - 故事课程列表。
  - 显示总进度、当前篇、首次学习进度和待强化数量。
  - 按故事顺序展示，不要求完成 Step4 五轮后才能进入下一篇。
- `/story/[lessonId]`
  - 四步学习页面。
  - 通过 URL 或内部状态表示当前步骤。
  - 支持继续上次未完成位置。

### API

- `GET /api/story/lessons`
  - 返回可用课程列表和用户级进度。
- `GET /api/story/lessons/[id]`
  - 返回课程详情、结构化故事内容、目标词和当前进度。
- `POST /api/story/lessons/[id]/progress`
  - 保存 Step1～3 的完成状态。
- `GET /api/story/review`
  - 返回到期的 Step4 目标词，按故事顺序和到期时间排序。
- `POST /api/story/review`
  - 提交某个词本轮“记得/模糊/忘记”。
  - 写入 `StoryReviewAttempt` 和 `UserStoryWordProgress`。
  - 调用现有 SM-2 逻辑更新对应 `UserWordMeaning`。
- `GET /api/story/lessons/[id]/words`
  - 支持 Step3 的分页、场景筛选或搜索。

## 7. 复习与 SM-2 集成

- Step3 完成后，`UserStoryProgress.status` 变为 `first_passed`，用户可进入下一篇。
- Step4 每轮只处理当前到期的目标词，不要求一次处理完整篇的所有词。
- 每个词的五轮状态独立推进；某个词忘记不阻塞其他词。
- 现有 SM-2 计算函数继续作为长期间隔调度依据。
- 故事层额外保存 `reviewRoundCompleted`，用于显示图片中的 1～5 列。
- 故事课程完成五轮后变为 `reinforced`，但不影响普通学习和后续故事。

## 8. 安全、隐私和文件管理

- `蛊真人.txt` 不提交 Git，也不部署到前端资源。
- 生成脚本从本地文件读取；部署环境只需要数据库中的生成课程。
- API key 和数据库连接仍只从 `.env` / `.env.local` 读取。
- 生成错误和原始模型响应不得写入用户可见页面，保留在脚本日志或受控错误字段中。

## 9. 测试和验收标准

### 解析和生成脚本

- 能用 GB18030 正确读取测试章节。
- 能识别章节标题并保持顺序。
- 对缺词、超 100 词、重复分配和无效 JSON 有明确失败结果。
- 中断后重新运行不会重复创建课程。
- 生成器可输出 61～150 篇范围内的课程，并覆盖 6098 个目标词。

### API 和数据库

- 新增 schema 可通过 Prisma 校验和迁移。
- 未登录的本地用户模型沿用现有 `getLocalUserId()`。
- 用户只能读取和修改自己的故事进度。
- 重复提交同一轮复习不会产生重复记录。
- Step3 完成后允许进入下一篇；Step4 未完成不阻塞。

### 前端交互

- Step1 正确渲染故事片段和目标词释义。
- Step2 正确隐藏和显示释义。
- Step4 满足 hover 临时显示、点击保持显示、再次点击隐藏。
- 移动端点击切换有效。
- 复习结果提交后表格对应轮次更新。
- 100 个目标词不会被强制渲染成一个不可用的长页面，应按场景或区块组织。

### 验收标准

用户能够：

1. 从 `/story` 进入第一篇故事。
2. 完成 Step1～Step3 并立即进入下一篇。
3. 在后续复习中逐轮完成 Step4。
4. 看到 1～5 轮复习表逐步填充。
5. 在故事模式中沿顺序学习一套 50～150 篇的连续主线故事。
6. 继续使用原有 `/learn` 和 `/review` 功能。

## 10. 非目标

本次不做：

- 把整本小说全文展示给用户。
- 在浏览器端实时读取和分析小说文件。
- 让用户必须完成五轮 Step4 才能继续新故事。
- 删除或重写现有普通学习和 SM-2 页面。
- 第一版提供复杂的人工故事编辑后台。

## 11. 实施顺序

1. 新增 Prisma 模型和迁移。
2. 实现小说 GB18030 解析和章节索引脚本。
3. 实现故事大纲和课程生成脚本，支持断点续跑。
4. 实现课程校验脚本和生成报告。
5. 实现故事列表 API 和页面。
6. 实现四步学习 API 和页面。
7. 接入 Step4 复习与 SM-2。
8. 运行 lint、类型检查、构建和故事数据校验。
9. 使用少量测试课程进行端到端验证，再开始全量生成。
