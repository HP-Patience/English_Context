# ContextVocab

语境驱动的考研英语词汇学习应用。基于「2026考研英语词汇闪过」词库（6098词，118分类），结合 AI 生成释义和例句，采用 SM-2 间隔重复算法安排复习。

## 功能

- **分类学习** — 高频/中频/低频/偶考/基础/补充，118个分组
- **AI 释义+例句** — 每词多义项配例句，全量 AI 生成
- **SM-2 复习** — 间隔重复算法，自评后自动调度
- **兴趣适配** — 选择兴趣领域，影响例句上下文
- **可配置 LLM** — 支持自定义 API endpoint 和模型

## 技术栈

- Next.js 16.2.9 (App Router)
- Prisma 5.22 + PostgreSQL (本地/Neon)
- Tailwind CSS
- DeepSeek / OpenAI API

## 本地开发

### 前置依赖

- **Node.js 20.9+**
- **PostgreSQL 16+** — [下载安装](https://www.postgresql.org/download/windows/)

### 首次启动

```bash
# 1. 安装依赖
npm install

# 2. 设置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY
# .env 中 DATABASE_URL 默认指向 localhost，密码改为你的 PG 密码

# 3. 创建数据库
psql -U postgres -c "CREATE DATABASE english_context;"

# 4. 初始化数据库表
npx prisma db push

# 5. 启动
npm run dev
```

> **注意**: 如果有 `.env.local`（由 `vercel env pull` 生成），它优先于 `.env`。如需本地开发，删除或覆盖 `.env.local` 中的 `DATABASE_URL` 为本地连接串：
> ```
> DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/english_context"
> ```

访问 [http://localhost:3456](http://localhost:3456)

### 初始化数据

```bash
# 从 txt 导入词库
node scripts/import-new.js

# AI 生成释义和例句（需要 OPENAI_API_KEY）
node scripts/generate-meanings.js
```

> **破坏性重置警告：** `node scripts/import-new.js` 会先在单个数据库事务中清空现有词汇数据。该重置也会删除所有已发布/草稿故事课程、故事课与 lesson-word 关联，以及全部用户故事首次学习进度、Step4 词进度和复习尝试历史。只能对明确允许完全重建的本地或专用数据库运行；不要对生产数据库运行。

## 故事学习运行时

### 页面与学习流程

- `/story`：只列出唯一发布槽位（`StoryCourse.readySlot = "ready"`）中的 `ready` 课程，显示当前篇、首次学习进度和到期 Step4 数量。
- `/story/[lessonId]`：结构化故事四步学习页。Step1 显示语境释义，Step2 先隐藏释义供回想，Step3 显示完整词册；完成 Step3 后下一篇立即可用。
- Step4 只处理当前到期词，记录精确的 `remembered` / `vague` / `forgotten` 结果和第 1～5 轮列，并同步现有 SM-2 数据。Step4 未完成不会阻塞下一篇。
- 原有 `/learn` 与 `/review` 路由保持可用，故事模式与普通模式共享 `Word`、`Meaning`、`UserWord`、`UserWordMeaning` 数据。

### 运行要求与本地发布数据

运行时需要 Node.js 20.9+、可连接的 PostgreSQL、已执行的 Prisma schema，以及一个完整发布的 ready course。故事数据准备顺序是：

1. 先导入普通词库和义项，确保 lesson word 能关联现有 `Word` / `Meaning`。
2. 使用下方离线流水线执行 `story:parse` → `story:outline` → `story:generate`。`story:generate` 会创建或续跑 draft course，并把课程、lesson 和 lesson-word 行写入 `DATABASE_URL` 指向的**本地或专用离线数据库**。
3. 执行 `story:validate`。只有完整校验通过时，事务才会把 draft 原子发布到唯一 `ready` 槽位，并归档旧 ready course；这一步就是运行时可见数据的发布步骤。
4. 使用同一个安全数据库连接启动 `npm run dev`，访问 `/story`。本地用户由 `LOCAL_USER_ID`（默认 `local-user`）确定。

不要用生产 `DATABASE_URL` 运行生成、夹具或 smoke。当前仓库没有把真实 PostgreSQL seed 作为测试前置条件；runtime smoke 使用共享的确定性内存 Prisma fixture，因此能证明 route → service → 持久化重载契约，但**不能证明真实 PostgreSQL 的 Serializable transaction、约束或连接行为**。部署前仍应在一次性 PostgreSQL 环境执行发布和浏览器验收。

### 运行时隐私边界

- 请求时只读取数据库中已发布的结构化 paragraph、目标词和用户进度；不会读取 `蛊真人.txt`，不会调用 OpenAI/LLM，也不需要任何 LLM API key。
- 原始小说不应存在于部署产物、`public/`、Git 或浏览器响应中。公开 lesson DTO 也不会返回生成阶段的 `sourceSummary` / `continuityNotes`。
- 原始正文只属于离线 parse/outline/generate 阶段；`story:outline` 会把正文发送到操作者批准的 endpoint，具体风险见下方“数据传输、版权、隐私与本地持久化”。

### 运行时验证

> **当前 lint 状态：** `npm run lint` 目前会因已知的仓库既有债务退出非零，基线是 **130 problems（36 errors、94 warnings）**。Task 8 改动文件的精确 ESLint 命令必须单独通过；全量 lint 仍需运行并确认计数没有新增。

```bash
# 确定性 route/service/persistence smoke（不读小说、不调用 LLM、不连接真实 DB）
npm run test:runtime -- scripts/test/story-runtime-smoke.mjs

# 全部 runtime/Vitest（包含上面的 smoke）
npm run test:runtime

# 全部离线故事流水线测试
npm run test:story

# 类型检查
npx tsc --noEmit

# Task 8 改动文件 lint：必须退出 0
npx eslint scripts/test/story-runtime-smoke.mjs scripts/test/helpers/fake-story-prisma.mjs scripts/test/story-lesson-repository.test.mjs scripts/test/runtime-tests.mjs vitest.config.ts

# 仓库全量 lint：当前预期退出非零，但必须保持上述既有基线不变
npm run lint

# 生产构建
npm run build
```

## 数据同步

### 从 Neon 拉到本地（初始化用）

```bash
node scripts/dump-neon.mjs | PGPASSWORD=local psql -U postgres -d english_context
```

### 从本地推回 Neon（同步学习进度到 Vercel 生产环境）

```bash
node scripts/sync-to-neon.mjs
```

推表：`UserWord`（掌握度）、`UserWordMeaning`（各义项数据）、`ReviewLog`（复习记录）、`DailyGoal`（每日打卡）。

## 项目结构

```
src/app/
  page.tsx          # 首页 — 分类列表 + 学习入口
  learn/            # 学习页 — 按分类顺序学习
  review/           # 复习页 — SM-2 间隔复习
  manual/           # 手动加词
  settings/         # 兴趣设置 + LLM 配置
  api/              # API 路由
prisma/
  schema.prisma     # 数据库模型
data/
  2026考研英语词汇闪过.txt  # 源词库
scripts/
  generate-meanings.js     # AI 释义+例句生成
  import-new.js            # 从 txt 导入词库
```

## 故事词汇课离线生成流水线

> 这是一条由操作者手动运行的离线发布流水线，不在应用请求链路中调用 LLM。默认原始小说路径固定为 `F:\english_context\蛊真人.txt`；默认词表必须精确为 **6098** 个词，课程必须有 **61–150** 课，每课最多 **100** 个目标词。

### 数据传输、版权、隐私与本地持久化

- `story:outline` 会把**原始章节正文作为 prompt 内容发送到配置的 LLM endpoint**，用于生成章节摘要。这里的“离线流水线”表示不在产品运行时执行，并不表示正文不会离开本机。
- LLM provider、代理或自定义 endpoint 可能记录、保留或审查 prompt。运行前必须由操作者确认 endpoint 的数据保留政策、版权/授权条件、隐私要求和组织合规政策；不要向未经批准的 endpoint 发送小说正文。
- 原始文件 `F:\english_context\蛊真人.txt` 仅保存在本地，已由 `.gitignore` 排除，不能提交到 Git。
- `scripts/.story-cache/` 只持久化章节元数据、生成摘要、outline、生成课程、验证报告和 SHA-256 输入指纹；章节索引、checkpoint、报告和数据库记录都**不得保存原始章节正文或凭证**。
- 环境变量值和 API key 不会写入日志、checkpoint 或报告。文档只列出变量名称。

### 环境变量名称

复制 `.env.example` 到 `.env` 后在本地填写：

- `DATABASE_URL`：`story:generate` / `story:validate` 使用的本地或专用离线数据库；不要指向生产库。
- `STORY_LLM_API_KEY` / `OPENAI_API_KEY` / `LLM_API_KEY`：按顺序选择第一个非空 API key。
- `STORY_LLM_BASE_URL` / `OPENAI_BASE_URL` / `LLM_BASE_URL`：可选的 OpenAI-compatible endpoint。
- `STORY_LLM_MODEL` / `OPENAI_MODEL` / `LLM_MODEL`：可选模型名。
- `STORY_LLM_TRANSPORT`：`auto`（默认，优先 Chat Completions，缺失时回退 Responses）、`chat-completions` 或 `responses`。

已导出的 shell 环境变量优先于 `.env` / `.env.local`；`.env.local` 不应提交。

### 版本化发布架构

- 每次语料生成属于一个版本化 `StoryCourse`。`StoryLesson` 以 `(courseId, order)` 唯一，不再全局按课序唯一。
- `story:generate` 只创建或续跑输入指纹完全一致的 **draft course**；它绝不会修改、降级或删除已经发布的课程。
- 每个 course version 使用独立 lesson checkpoint 目录。source、章节批次、摘要集合、outline/词汇分配和上一课 continuity 都绑定 SHA-256 输入指纹；输入变化时旧 checkpoint 会被拒绝。
- `story:validate` 在一个 Serializable Prisma/PostgreSQL 事务内读取并完整校验 draft。只有全部校验成功后，才把 draft 标记为唯一 `ready` course，并把此前的 ready course 标记为 `archived`。
- `StoryCourse.readySlot` 的唯一约束配合事务/application checks 保证最多一个 ready publication。验证失败或生成中断时，现有 ready course 保持不变，draft 可继续生成。
- 已发布版本不可变；旧版本的 lesson ID、lesson-word ID 和用户进度仍可继续使用。后续 runtime 工作应只查询 `readySlot = "ready"` 的 course。

### 执行顺序（离线生成、写入 draft、校验发布）

```bash
# 1. 解析本地 GB18030 小说，写 metadata-only 索引、输入指纹和编号异常诊断
npm run story:parse

# 2. 把章节正文发送给已批准的 LLM endpoint，生成摘要和连续剧情 outline
npm run story:outline

# 3. 创建/续跑 draft StoryCourse，并生成/持久化 draft 中的 lesson
npm run story:generate

# 4. 完整校验 draft；成功后原子发布并归档上一 ready course
npm run story:validate
```

解析命令会向操作者报告章节编号跳号，以及无法解析/非单调编号导致的 order repair。必须审阅这些诊断；最终 outline 和 corpus 校验按索引中的实际章节顺序做精确首尾、无遗漏、无重叠覆盖，而不是假设章节编号连续。

常用覆盖参数（仅用于本地夹具/调试）：

```bash
node scripts/parse-novel.mjs --source path/to/fixture.txt --output path/to/cache/novel-index.json
node scripts/build-story-outline.mjs --source path/to/fixture.txt --index path/to/cache/novel-index.json --output path/to/cache/story-outline.json --vocabulary-count 205
node scripts/generate-story-lessons.mjs --index path/to/cache/novel-index.json --outline path/to/cache/story-outline.json --checkpoint-dir path/to/cache/lessons --report path/to/cache/story-generation-report.json --expected-word-count 205
node scripts/validate-story-lessons.mjs --index path/to/cache/novel-index.json --outline path/to/cache/story-outline.json --report path/to/cache/story-validation-report.json --expected-word-count 205
```

### 断点续跑与验证

- 默认生产约束保持为：精确 6098 个词、61–150 课、每课不超过 100 词；outline 总容量必须在写 checkpoint 前覆盖全部词汇。
- generation 和 final validation 都会重新核对 source index、outline 指纹、词序/释义、lesson-word 双射和实际章节索引覆盖。
- 运行纯夹具 smoke test 可验证四个 command entry point、repository transaction、生成中断、失败发布回滚、续跑和最终原子切换；它不读取真实小说、不调用真实 LLM、不连接真实数据库：

```bash
npm run test:story -- scripts/test/story-pipeline-smoke.mjs
```
