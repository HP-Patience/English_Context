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
  - 安装时密码设 `local`，端口 `5432`
  - 创建数据库：

```bash
psql -U postgres -c "CREATE DATABASE english_context;"
```

### 启动

```bash
# 安装依赖
npm install

# 设置环境变量
cp .env.example .env
# 在 .env 中填入 OPENAI_API_KEY

# 初始化数据库表
npx prisma db push

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 部署

Vercel 部署自动使用 Neon PostgreSQL（通过 Vercel Dashboard 配置 `DATABASE_URL`）。

本地 `.env.local` 由 `vercel env pull` 自动填充，包含生产数据库连接串。

访问 [http://localhost:3000](http://localhost:3000)

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
