# 学习页单词高亮 + 加载性能优化

## Context

用户反馈两个问题：
1. 学习页例句中目标单词没有高亮显示（当前依赖 LLM 生成的 `**` 标记，不可靠）
2. 页面加载慢，需要优化

## 方案

### 1. 学习页单词高亮（learn/page.tsx）

**问题**：第 107-113 行用 `\*\*(.+?)\*\*` 分割句子依赖数据中已有 `**` 标记。LLM prompt 没要求加标记，实际数据中标记经常缺失。

**修复**：改用正则动态匹配，和 review 页第 50-53 行 `highlightWord` 函数一样——在句子里不区分大小写找目标词，包裹高亮样式。

**改动**：
- `src/app/learn/page.tsx`：替换 `sentenceParts` 计算逻辑
  - 删除 `**` split 代码（第 107-113 行）
  - 新增 `highlightWord(sentence, word)` 函数或内联逻辑
  - `item.word` 就是目标词，直接匹配

### 2. 页面加载性能优化

**问题诊断**（来自代码分析）：
- 学习页评分后用户点"继续"才触发 `fetchNext()`，串行等待
- learn API 用 JS for 循环遍历 group items，循环内做额外 DB 查询（N+1 模式）
- 各 API 路由每次调用 `getLocalUserId()` 做一次 upsert（读操作也多一次 DB 往返）
- 完全客户端渲染，无缓存

**改动**：

#### a) 预取下一个词（learn/page.tsx）
评分完成后台预取下一个词，用户点"继续"时直接显示。

#### b) 优化 learn API 查询（api/kaoyan/learn/route.ts）
- 当前找第一个未学词：遍历 items → 遍历 meanings → 查 sentence。最坏情况遍历完整个组才返回 `{done: true}`
- 无需大改，但可把 sentence 查询移出循环：先找到第一个未学词，再查 sentence（减少循环内的 await）

#### c) 简单 API 缓存（api/kaoyan/learn/route.ts）
- 对 `getLocalUserId()` 的结果做请求级缓存（模块级变量，每个请求不需要重复 upsert）
- 对 "done" 检查结果做简单缓存

#### d) 加载骨架屏（learn/page.tsx）
- 把 "加载中..." 文字替换成简单骨架屏，提升感知性能

### 3. 改动清单

| 文件 | 改动 |
|------|------|
| `src/app/learn/page.tsx` | 1) 正则高亮替代 `**` split；2) 评分后预取；3) 骨架屏 |
| `src/app/api/kaoyan/learn/route.ts` | 优化 query 模式，避免循环内 await |

## 验证

1. 高亮：打开学习页，确认例句中目标单词有琥珀色加粗下划线样式
2. 性能：对比改动前后 "继续" 按钮点击到新词显示的时间
3. 回归：评分、bookmark、完成页等交互不受影响
