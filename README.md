# ContextVocab

语境驱动的考研英语词汇学习应用。基于「2026考研英语词汇闪过」词库（6098词，118分类），结合 AI 生成释义和例句，采用 SM-2 间隔重复算法安排复习。

## 功能

- **分类学习** — 高频/中频/低频/偶考/基础/补充，118个分组
- **AI 释义+例句** — 每词多义项配例句，全量 AI 生成
- **SM-2 复习** — 间隔重复算法，自评后自动调度
- **兴趣适配** — 选择兴趣领域，影响例句上下文
- **可配置 LLM** — 支持自定义 API endpoint 和模型

## 技术栈

- Next.js (App Router)
- Prisma + PostgreSQL (本地/Neon)
- Tailwind CSS
- DeepSeek / OpenAI API

## 本地开发

### 前置依赖

- **Node.js 20+**
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

> 这条流水线用于把本地小说源文件离线加工成可入库的故事词汇课。它不是运行时功能：真实生成只应由操作者在本机/受控环境中手动执行，不会在应用请求链路中调用 LLM，也不会依赖线上原始小说文件。

### 本地原始文件与缓存

- 原始小说文件固定放在仓库外层工作区根目录：`F:\english_context\蛊真人.txt`。
- `蛊真人.txt` 是 local-only 文件，不能提交到 Git；仓库 `.gitignore` 已忽略 `/蛊真人.txt`。
- 生成缓存写入 `scripts/.story-cache/`，包括章节索引、outline checkpoint、lesson checkpoint、生成报告和验证报告；该目录也已被 `.gitignore` 忽略。
- 章节索引只保存元数据，不保存正文；outline/lesson checkpoint 用于断点续跑。

### 环境变量名称（不要把值写进文档或提交）

复制 `.env.example` 到 `.env` 后，在本地填写需要的值：

- `DATABASE_URL`：`story:generate` 和 `story:validate` 使用的数据库连接。请指向本地或专门的离线生成库，不要指向生产库。
- `STORY_LLM_API_KEY` / `OPENAI_API_KEY` / `LLM_API_KEY`：LLM API key，按优先级选择第一个有值的变量。
- `STORY_LLM_BASE_URL` / `OPENAI_BASE_URL` / `LLM_BASE_URL`：可选，自定义 LLM endpoint。
- `STORY_LLM_MODEL` / `OPENAI_MODEL` / `LLM_MODEL`：可选，未设置时使用脚本默认模型。

已导出的 shell 环境变量优先于 `.env` / `.env.local`；`.env.local` 不应提交。

### 执行顺序

```bash
# 1. 解析本地 GB18030 小说源，生成 metadata-only 章节索引
npm run story:parse

# 2. 使用离线 LLM 调用构建连续剧情 outline，并写入可续跑 checkpoint
npm run story:outline

# 3. 使用离线 LLM 调用生成课程并持久化 ready lesson（需要离线数据库）
npm run story:generate

# 4. 校验 ready lesson 数量、每课最多 100 个目标词、全词表精确覆盖、重复/遗漏、关联行一致性
npm run story:validate
```

常用覆盖参数（调试/夹具时使用，避免碰生产路径）：

```bash
node scripts/parse-novel.mjs --source path/to/fixture.txt --output path/to/cache/novel-index.json
node scripts/build-story-outline.mjs --source path/to/fixture.txt --index path/to/cache/novel-index.json --output path/to/cache/story-outline.json
node scripts/generate-story-lessons.mjs --index path/to/cache/novel-index.json --outline path/to/cache/story-outline.json --checkpoint-dir path/to/cache/lessons --report path/to/cache/story-generation-report.json
node scripts/validate-story-lessons.mjs --report path/to/cache/story-validation-report.json
```

### 断点续跑与校验

- `story:outline` 会复用 `scripts/.story-cache/outline/chapter-summaries.json` 和 `story-outline.checkpoint.json`；如果 checkpoint 结构不合法，脚本会失败而不是静默降级。
- `story:generate` 会复用 `scripts/.story-cache/lessons/lesson-####.json`，并从数据库中第一个非 `ready` lesson 开始继续，保持课程连续性。
- `story:validate` 应在真实生成后运行；只有报告 `ok: true` 才能认为本次离线生成可交付。
- 可运行离线 smoke test 验证夹具链路（不读 12.7 MB 原始小说、不连生产 DB、不需要真实凭证）：

```bash
npm run test:story -- scripts/test/story-pipeline-smoke.mjs
```
