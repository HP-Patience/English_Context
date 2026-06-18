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
