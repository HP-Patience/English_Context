# 多用户学习与互动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (native) to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 ContextVocab 从固定单用户应用改造成支持管理员创建账号、用户进度隔离、后台管理和管理员—朋友学习互动的多人应用。

**Architecture:** 复用现有 Prisma、`User` 模型、scrypt 密码哈希和 JWT Cookie；JWT subject 改为数据库用户 ID，由服务端解析当前用户。先完成身份和所有既有用户数据路径的隔离，再增加后台和互动模型；排行榜从已有学习记录派生，避免重复维护事实。

**Tech Stack:** Next.js 16.2.9 App Router、React 19、TypeScript、Prisma 5、PostgreSQL、Vitest、`jose`、Node `crypto.scrypt`、Serwist Cache Storage。

**Spec:** `F:\english_context\docs\superpowers\specs\2026-10-02-multi-user-learning-design.md`

## Global Constraints

- 原始小说不进入 `public/`、客户端 bundle、API 响应或 Git。
- `local-user` 数据迁移到唯一管理员；朋友账号从空白个人学习数据开始。
- 单词、词义、词表分组和已发布故事课程共享；学习、复习、故事、收藏、目标、配置和离线数据按用户隔离。
- 所有用户数据接口从服务端会话获得 `userId`，不信任客户端传入的用户 ID。
- 不做公开注册、邮箱找回密码、第三方登录或用户自助修改密码。
- 删除账号必须二次确认并永久删除其个人学习、消息和互动数据；公共内容不删除。
- 管理员不读取 LLM/TTS API Key，也不直接修改用户详细学习记录。
- 互动关系只允许管理员与其直接创建的普通用户；普通用户之间不互动。
- 小测验只记录互动结果，不修改正式掌握度、SM-2 参数、复习间隔或故事复习轮次。
- IP + HTTP 只作为临时熟人测试约束，不视为安全公网方案；仍保留密码哈希、HttpOnly Cookie、登录限流和服务端授权。
- 修改 Prisma schema 必须配套数据库迁移、兼容、回滚或恢复说明；不以 `prisma db push` 代替生产部署。
- 不覆盖工作区现有未提交的故事功能修改，不提交或推送代码。
- 写 Next.js 代码前阅读 `node_modules/next/dist/docs/` 中 Next 16 Proxy、cookies 和 Route Handler 指南。

## Review Focus

1. 停用账号的旧 JWT：所有 Route Handler 重新检查数据库状态；测试归 Task 2/3。
2. 同一浏览器切换账号：不复用前一账号 API 缓存、故事离线快照或页面数据；测试归 Task 5。
3. 永久删除级联：不留个人悬挂记录，不删除公共词库和故事；测试归 Task 4。
4. 伪造 `userId` 或越权互动：普通用户不能调用管理员接口，朋友不能互相互动；测试归 Task 3/4/6。
5. 互动小测验不改正式学习状态；测试归 Task 7。

## File Map

### 身份、迁移和既有学习路径

- Modify: `F:\english_context\prisma\schema.prisma`
- Create: `F:\english_context\prisma\migrations\20261002_multi_user_accounts\migration.sql`
- Create: `F:\english_context\prisma\migrations\20261002_require_account_credentials\migration.sql`
- Create: `F:\english_context\scripts\migrate-single-user-to-admin.mjs`
- Create: `F:\english_context\docs\deployment\multi-user-database-migration.md`
- Modify: `F:\english_context\src\lib\prisma.ts`
- Create: `F:\english_context\src\lib\auth\current-user.ts`
- Modify: `F:\english_context\src\lib\auth\config.ts`
- Modify: `F:\english_context\src\lib\auth\session.ts`
- Modify: `F:\english_context\src\app\api\auth\login\route.ts`
- Modify: `F:\english_context\src\proxy.ts`
- Modify: `F:\english_context\src\app\api\auth\logout\route.ts`
- Modify: `F:\english_context\src\lib\llm.ts`
- Modify: `F:\english_context\src\app\api\llm\test\route.ts`
- Modify: `F:\english_context\src\app\api\models\route.ts`
- Modify: `F:\english_context\src\app\api\tts\route.ts`

All existing user-bound Route Handlers under `F:\english_context\src\app\api\` and server pages under `F:\english_context\src\app\story\` that currently call `getLocalUserId()` must be modified; the complete caller list is obtained with `rg -l "getLocalUserId" F:\english_context\src` before implementation.

### Admin

- Create: `F:\english_context\src\lib\admin\authorization.ts`
- Create: `F:\english_context\src\lib\admin\users.ts`
- Create: `F:\english_context\src\app\api\admin\users\route.ts`
- Create: `F:\english_context\src\app\api\admin\users\[id]\route.ts`
- Create: `F:\english_context\src\app\api\admin\users\[id]\password\route.ts`
- Create: `F:\english_context\src\app\api\admin\users\[id]\stats\route.ts`
- Create: `F:\english_context\src\app\admin\page.tsx`
- Create: `F:\english_context\src\components\admin\UserManagementPanel.tsx`

### 互动

- Create: `F:\english_context\src\lib\interaction\relationship.ts`
- Create: `F:\english_context\src\lib\interaction\leaderboard.ts`
- Create: `F:\english_context\src\lib\interaction\challenge.ts`
- Create: `F:\english_context\src\lib\interaction\message.ts`
- Create: `F:\english_context\src\lib\interaction\quiz.ts`
- Create: `F:\english_context\src\app\api\interaction\overview\route.ts`
- Create: `F:\english_context\src\app\api\interaction\leaderboards\route.ts`
- Create: `F:\english_context\src\app\api\interaction\challenges\route.ts`
- Create: `F:\english_context\src\app\api\interaction\messages\route.ts`
- Create: `F:\english_context\src\app\api\interaction\messages\[id]\read\route.ts`
- Create: `F:\english_context\src\app\api\interaction\quizzes\route.ts`
- Create: `F:\english_context\src\app\api\interaction\quizzes\[id]\submit\route.ts`
- Create: `F:\english_context\src\app\interaction\page.tsx`
- Create: `F:\english_context\src\components\interaction\InteractionDashboard.tsx`
- Create: `F:\english_context\src\components\interaction\LeaderboardPanel.tsx`
- Create: `F:\english_context\src\components\interaction\ChallengePanel.tsx`
- Create: `F:\english_context\src\components\interaction\MessagePanel.tsx`
- Create: `F:\english_context\src\components\interaction\QuizPanel.tsx`

### Tests and docs

- Modify: `F:\english_context\src\lib\auth\session.test.ts`
- Modify: `F:\english_context\src\app\api\auth\login\route.test.ts`
- Modify: `F:\english_context\src\proxy.test.ts`
- Create: `F:\english_context\src\lib\auth\current-user.test.ts`
- Create: `F:\english_context\src\lib\admin\users.test.ts`
- Create: `F:\english_context\src\app\api\admin\users\route.test.ts`
- Create: `F:\english_context\src\lib\interaction\leaderboard.test.ts`
- Create: `F:\english_context\src\lib\interaction\challenge.test.ts`
- Create: `F:\english_context\src\lib\interaction\message.test.ts`
- Create: `F:\english_context\src\lib\interaction\quiz.test.ts`
- Create: `F:\english_context\src\app\api\interaction\interaction-routes.test.ts`
- Modify: `F:\english_context\src\lib\api-cache.ts`
- Modify: `F:\english_context\src\lib\story-offline-cache.ts`
- Modify: `F:\english_context\src\lib\story-offline-cache.test.ts`
- Modify: `F:\english_context\src\components\LoginForm.tsx`
- Modify: `F:\english_context\src\components\LogoutButton.tsx`
- Modify: `F:\english_context\README.md`

---

### Task 1: Add the database account boundary and bootstrap migration

**Interfaces:**
- Final `User` fields: `username`, `passwordHash`, `role` (`admin|user`), `status` (`active|disabled`), `statsSharingEnabled`.
- `normalizeBootstrapAccount(input): { id, username, passwordHash, role, status, statsSharingEnabled }`.
- Bootstrap reads `LOCAL_USER_ID`, `APP_AUTH_USERNAME`, and `APP_AUTH_PASSWORD_HASH` without printing secrets.

- [x] **Step 1: Write the failing migration contract test**

In `scripts/test/single-user-migration.test.mjs`, assert that `Owner` normalizes to `owner`, produces the admin fields and sharing enabled, and that missing credentials throw.

- [x] **Step 2: Run it and verify failure**

```bash
node --test scripts/test/single-user-migration.test.mjs
```

Expected: FAIL because the migration helper is not implemented.

- [x] **Step 3: Add account fields to Prisma and the additive migration**

Add nullable `username` and `passwordHash` plus defaulted role/status/sharing fields. Keep all existing learning relations. Generate and review the additive SQL with:

```bash
npx prisma migrate dev --name multi_user_accounts --create-only
```

Store the reviewed migration at `prisma/migrations/20261002_multi_user_accounts/migration.sql`; it must not rewrite existing learning rows.

- [x] **Step 4: Implement the bootstrap script**

The script upserts `local-user`, normalizes the configured username, copies the existing password hash, sets `admin/active/statsSharingEnabled=true`, and exits non-zero if required environment values are absent. It must never log `DATABASE_URL`, password values, password hashes, or API keys.

- [x] **Step 5: Tighten account credentials after backfill**

Make `username` and `passwordHash` required in the final schema and create `prisma/migrations/20261002_require_account_credentials/migration.sql`. The migration must fail before altering constraints if any row is still null.

- [x] **Step 6: Write `docs/deployment/multi-user-database-migration.md`**

Document: PostgreSQL backup; additive migration; bootstrap script; verification of exactly one active admin and zero null credentials; final constraint migration; restart; two-account smoke test; restore path. State explicitly that `prisma db push` is not the production mechanism.

- [x] **Step 7: Run the contract test**

```bash
node --test scripts/test/single-user-migration.test.mjs
```

Expected: PASS.

### Task 2: Replace single-user authentication with database sessions

**Interfaces:**
- `createSessionToken(userId: string, secret: string, now?: Date): Promise<string>`
- `verifySessionToken(token: string | undefined, secret: string, now?: Date): Promise<string | null>`
- `getCurrentUser(): Promise<{ id: string; username: string; name: string | null; role: 'admin' | 'user'; status: 'active' | 'disabled'; statsSharingEnabled: boolean } | null>`
- `requireCurrentUser()` returns the active current user or a 401-compatible error.
- `requireAdmin()` returns the active admin or a 403-compatible error.

- [x] **Step 1: Update session tests first**

Change `src/lib/auth/session.test.ts` to cover user-ID subjects, expiry, malformed tokens and null results. Run it and confirm the old username/boolean contract fails.

- [x] **Step 2: Implement session and current-user helpers**

Keep HS256, the existing seven-day lifetime, HttpOnly/SameSite options and `APP_AUTH_SECRET`. Parse the Cookie API, verify the subject, query the user, and reject missing, deleted or disabled users. Do not trust role/status claims embedded in JWTs.

- [x] **Step 3: Update login**

`POST /api/auth/login` trims and normalizes username, finds the database user, verifies the scrypt hash, rejects disabled users with the same generic credential error, preserves rate limiting, and issues a token containing the user ID. Environment username/hash are no longer the runtime login source.

- [x] **Step 4: Update proxy and logout**

Proxy validates the new token format and keeps existing page/API routing. Route Handlers perform the database active-status check through `requireCurrentUser`. Logout keeps `Clear-Site-Data` and expires the cookie.

- [x] **Step 5: Add tests and run them**

Test active admin/friend login, wrong password, disabled login, missing secret, deleted/disabled session, unauthenticated page/API and valid session. Run:

```bash
npx vitest run src/lib/auth/session.test.ts src/lib/auth/current-user.test.ts src/app/api/auth/login/route.test.ts src/proxy.test.ts --maxWorkers=1
```

Expected: PASS.

### Task 3: Migrate all existing learning paths to the session user

**Interfaces:**
- Each user-owned handler begins with `const { id: userId } = await requireCurrentUser()`.
- `getLocalUserId()` and `LOCAL_USER_ID` are removed after all callers are migrated.
- `getWordData(word: string, userId: string)` and `generateSentences(..., userId: string)` read only that user’s LLM configuration.

- [x] **Step 1: Inventory callers**

Run:

```bash
rg -n "getLocalUserId|LOCAL_USER_ID" F:\english_context\src --glob '*.{ts,tsx}'
```

Classify personal reads/writes versus public-content reads. No caller may remain at task completion.

- [x] **Step 2: Add representative isolation tests**

Cover `/api/stats`, `/api/review/submit`, story progress and `/api/story/offline`: a friend request sees and changes only friend rows; arbitrary body `userId` values are ignored; public Word/Meaning/StoryCourse/StoryLesson data remains shared.

- [x] **Step 3: Replace fixed-user reads and writes**

Update every caller listed by the inventory, including bookmarks, daily goals, interests, kaoyan learning/stats, relearn, review queue/analysis/submit, search, settings, words, all story lesson/progress/completion/review paths, server story pages and LLM/TTS routes. Add `userId` to every personal Prisma `where`, `create`, `update`, `upsert` and delete. Preserve public-content queries.

- [x] **Step 4: Update LLM/TTS configuration flow**

Pass the authenticated ID from `/api/words`, `/api/llm/test`, `/api/models` and `/api/tts`; never fall back to another user’s stored config. Keep only existing process-level environment fallback.

- [x] **Step 5: Remove fixed-user code and run tests**

Run:

```bash
npm run test:runtime -- src/lib src/app/api/auth src/app/api/story/offline/route.test.ts --maxWorkers=1
npx vitest run src/app src/components --maxWorkers=1
```

Expected: existing story/learning tests pass; pre-existing unrelated failures are reported separately.

### Task 4: Add administrator user management and safe deletion

**Interfaces:**
- `requireAdmin()` is the only admin authorization gate.
- `createManagedUser({ username, name, password }): Promise<AdminUserSummary>`
- `setManagedUserStatus(adminId, userId, status): Promise<AdminUserSummary>`
- `resetManagedUserPassword(adminId, userId, password): Promise<void>`
- `deleteManagedUser(adminId, userId): Promise<void>`
- `getManagedUserStats(adminId, userId): Promise<SharedStats>`

**Files:** `src/lib/admin/authorization.ts`, `src/lib/admin/users.ts`, the four `/api/admin/users` Route Handlers, `src/app/admin/page.tsx`, `src/components/admin/UserManagementPanel.tsx`, and their tests.

- [x] **Step 1: Write failing authorization/deletion tests**

Cover normal-user-to-admin API calls (403), admin self-delete (400), duplicate username (409), invalid input (400), enable/disable, password reset without returning the old hash, permanent deletion in a transaction, and preservation of `Word`, `Meaning`, `WordGroup`, `StoryCourse` and `StoryLesson` rows.

- [x] **Step 2: Implement admin validation and service functions**

Validate non-empty username/nickname, existing password length bounds and role/status values. Hash new/reset passwords with the current scrypt helper. Derive the administrator from the session; never accept an admin ID from the request body.

- [x] **Step 3: Implement permanent deletion**

Delete user-owned descendants in dependency order inside one Prisma transaction, including UserWordMeaning sentences, review logs/sessions, story progress/completions/bookmarks/review attempts, DailyGoal, messages, challenges, quizzes and the User row. Do not rely on a client-provided list of IDs and do not delete public Word or Story rows.

- [x] **Step 4: Implement API routes**

```text
GET  /api/admin/users               -> summaries
POST /api/admin/users               -> create ordinary user
PATCH /api/admin/users/:id          -> status or stats-sharing flag
DELETE /api/admin/users/:id         -> permanent delete
POST /api/admin/users/:id/password  -> reset password
GET  /api/admin/users/:id/stats     -> aggregate stats
```

- [x] **Step 5: Implement the admin page**

Render account list, create form, status control, reset-password form, sharing toggle, aggregate stats and permanent-delete confirmation. Never render password hashes, LLM/TTS config or detailed review rows. Use accessible labels and `role="alert"` for errors.

- [x] **Step 6: Run admin tests**

```bash
npx vitest run src/lib/admin src/app/api/admin --maxWorkers=1
```

Expected: PASS.

### Task 5: Make browser and story offline state safe across account switching

**Interfaces:**
- `clearCache()` clears all in-memory user API responses.
- `purgeStoryOfflineCache()` completes before logout navigation.
- Authenticated API routes remain NetworkOnly in `sw.ts`.

**Files:** `src/lib/api-cache.ts`, `src/lib/story-offline-cache.ts`, `src/components/LoginForm.tsx`, `src/components/LogoutButton.tsx`, `src/app/api/story/offline/route.ts`, `sw.ts`, and their tests.

- [x] **Step 1: Add failing cache-switch tests**

Test that `cachedFetch` cannot return a previous account’s response after `clearCache`, all versioned story caches are purged, login clears sensitive caches before redirect, logout does not redirect when purge fails, and service-worker API routes stay NetworkOnly.

- [x] **Step 2: Implement one explicit cache boundary**

Reuse existing login/logout clearing. Add a single function that clears in-memory API cache and every story offline cache. Do not add service-worker caching for authenticated APIs. If an offline user marker is needed, store only a non-secret ID marker and validate it before rendering; never cache passwords or API keys.

- [x] **Step 3: Protect the offline endpoint**

Require the current session in `/api/story/offline`, preserve `Cache-Control: private, no-store`, keep public course content shared, and ensure any user-specific progress in the snapshot is current-user-only.

- [x] **Step 4: Run cache/story tests**

```bash
npx vitest run src/lib/api-cache.test.ts src/lib/story-offline-cache.test.ts src/app/api/story/offline/route.test.ts src/components/LogoutButton.test.tsx --maxWorkers=1
```

Expected: PASS.

### Task 6: Add derived statistics, five leaderboards and one shared challenge

**Interfaces:**
- `assertInteractionPair(actorId: string, otherUserId: string): Promise<void>`
- `getLeaderboards(now: Date, viewerId: string): Promise<FiveLeaderboards>`
- `createChallenge(adminId, { kind, target, startsAt, endsAt, title }): Promise<Challenge>`
- `getActiveChallenge(viewerId: string): Promise<ChallengeProgress | null>`

**Files:** add interaction models to `prisma/schema.prisma`; create `src/lib/interaction/relationship.ts`, `leaderboard.ts`, `challenge.ts`; create overview, leaderboard and challenge Route Handlers and tests.

- [x] **Step 1: Write failing metric tests**

With fixed UTC fixtures, verify that completed DailyGoal rows count once per day, weekly learning/review counts use only the target user, streak uses existing `calculateStreak`, story completion uses the current ready course, and users with sharing disabled are omitted from peer views.

- [x] **Step 2: Add the minimal challenge model**

Add creator, title, metric kind (`active_days|learned_words|story_completion`), target, start/end, status and timestamps. Add only the administrator—selected friend participation relation; enforce one active challenge in the service layer. Do not create a generic friendship/group graph.

- [x] **Step 3: Implement relationship authorization**

Allow only administrator ↔ active ordinary-user pairs. Reject self-pairs, ordinary-user ↔ ordinary-user requests, disabled accounts and arbitrary client IDs.

- [x] **Step 4: Implement leaderboard and overview APIs**

Return five independent lists with rank, display name and metric value. Apply the sharing flag. Never return word IDs, detailed review rows, configuration or passwords. Derive metrics from DailyGoal, ReviewLog, existing streak logic and story completion rows.

- [x] **Step 5: Implement challenge API**

Only the administrator can create a challenge. Reject a second active challenge, non-positive targets, invalid date ranges and unsupported metric kinds. Derive progress without writing UserWord, UserWordMeaning, ReviewLog or story review state.

- [x] **Step 6: Run interaction metric tests**

```bash
npx vitest run src/lib/interaction/leaderboard.test.ts src/lib/interaction/challenge.test.ts src/app/api/interaction/interaction-routes.test.ts --maxWorkers=1
```

Expected: PASS.

### Task 7: Add asynchronous messages, fixed encouragements and isolated word quizzes

**Interfaces:**
- `sendMessage(senderId, { recipientId, body, kind: 'text'|'encouragement' }): Promise<MessageSummary>`
- `listMessages(viewerId, cursor?): Promise<MessageSummary[]>`
- `markMessageRead(viewerId, messageId): Promise<void>`
- `createQuiz(senderId, { recipientId, wordIds }): Promise<QuizSummary>`
- `submitQuiz(viewerId, quizId, answers): Promise<QuizResult>`

**Files:** add message/quiz models to `prisma/schema.prisma`; create `src/lib/interaction/message.ts`, `quiz.ts`; create message, read, quiz and submit Route Handlers and tests.

- [x] **Step 1: Write failing message/quiz tests**

Cover pair-only access, non-empty bounded message bodies, server allowlisted encouragement values, recipient-only read marking, 1–10 unique public word IDs, sender/recipient submission checks, answer persistence, and unchanged UserWordMeaning/ReviewLog after quiz submission.

- [x] **Step 2: Add models with public-word references**

Use one message table with `kind`, sender, recipient, body, read timestamp and created timestamp. Use quiz assignment, selected-word and answer-result rows. Deleting a user must remove these rows without deleting referenced public `Word` rows.

- [x] **Step 3: Implement messages**

Use newest-first pagination, no real-time transport, no attachments, no push notifications and no generic threads. Use the same relationship authorization as Task 6.

- [x] **Step 4: Implement quizzes**

Validate selected words as public content, not as the sender’s learned words. Store answers as interaction data and never call review scheduling helpers during submission.

- [x] **Step 5: Add API routes and run tests**

```text
GET  /api/interaction/messages
POST /api/interaction/messages
POST /api/interaction/messages/:id/read
GET  /api/interaction/quizzes
POST /api/interaction/quizzes
POST /api/interaction/quizzes/:id/submit
```

Run:

```bash
npx vitest run src/lib/interaction/message.test.ts src/lib/interaction/quiz.test.ts --maxWorkers=1
```

Expected: PASS.

### Task 8: Add the account-management and interaction UI

**Files:**
- Create: `F:\english_context\src\app\admin\page.tsx`
- Create: `F:\english_context\src\components\admin\UserManagementPanel.tsx`
- Create: `F:\english_context\src\app\interaction\page.tsx`
- Create: `F:\english_context\src\components\interaction\InteractionDashboard.tsx`
- Create: `F:\english_context\src\components\interaction\LeaderboardPanel.tsx`
- Create: `F:\english_context\src\components\interaction\ChallengePanel.tsx`
- Create: `F:\english_context\src\components\interaction\MessagePanel.tsx`
- Create: `F:\english_context\src\components\interaction\QuizPanel.tsx`
- Modify: `F:\english_context\src\app\layout.tsx`
- Test: `F:\english_context\src\components\admin\UserManagementPanel.test.tsx`
- Test: `F:\english_context\src\components\interaction\InteractionDashboard.test.tsx`

- [x] **Step 1: Add UI tests for locked and empty states**

Test that ordinary users do not see admin controls, no paired user renders an empty interaction state, sharing-disabled users do not appear in peer leaderboards, challenge creation is admin-only, and quiz results explicitly state that formal review progress was not changed.

- [x] **Step 2: Implement the admin panel**

Render account list, create form, enable/disable control, reset-password form, sharing toggle, aggregate stats and permanent-delete confirmation. Use accessible labels, keyboard-operable confirmation UI and `role="alert"` errors. Never render secrets or detailed review rows.

- [x] **Step 3: Implement the interaction dashboard**

Render five leaderboard tabs, current challenge, message list/composer, fixed encouragement actions and quiz list/composer/submission. Use existing styling and cache invalidation patterns. Do not add a real-time dependency.

- [x] **Step 4: Add navigation conditionally**

Expose the admin link only for an admin session and the interaction link only when a valid paired account exists. Keep API authorization authoritative even when a link is hidden.

- [x] **Step 5: Run component tests**

```bash
npx vitest run src/components/admin src/components/interaction --maxWorkers=1
```

Expected: PASS.

### Task 9: Update documentation and run the complete verification gate

**Files:**
- Modify: `F:\english_context\README.md`
- Modify: `F:\english_context\docs\adr\0005-multi-user-learning-data-boundary.md`
- Modify: `F:\english_context\docs\deployment\multi-user-database-migration.md`

- [x] **Step 1: Document local bootstrap and deployment**

Add the additive migration, bootstrap script, final constraint migration, account creation flow, and two-account smoke test to README. State that IP + HTTP is temporary testing only and that HTTPS is required before safe public use.

- [x] **Step 2: Reconcile ADR 0005**

Mark it `accepted` only if the implementation preserves the approved data ownership and administrator—friend boundary. If the boundary changes, create a new ADR rather than silently rewriting the decision.

- [x] **Step 3: Run focused runtime verification**

```bash
npm run test:runtime -- src/lib src/app/api/story/offline/route.test.ts --maxWorkers=1
```

Expected: PASS, with unrelated existing failures listed separately.

- [x] **Step 4: Run component and route verification**

```bash
npx vitest run src/app src/components --maxWorkers=1
```

Expected: PASS, with no skipped assertions added for this feature.

- [x] **Step 5: Run type checking and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no new errors attributable to this feature; existing lint debt is reported rather than broadly refactored.

- [x] **Step 6: Run story pipeline verification**

```bash
npm run test:story
```

Expected: PASS; story generation and validation behavior remains unchanged.

- [x] **Step 7: Perform the manual acceptance matrix**

Verify with two non-production accounts:

```text
admin login -> existing admin progress visible
friend login -> empty personal progress and shared public vocabulary
admin learns/reviews -> friend data unchanged
friend learns/reviews -> admin data unchanged
admin create/disable/reset/delete friend -> expected lifecycle behavior
logout/login switch -> no previous API or offline story data visible
admin stats -> aggregate only, no secrets or detailed logs
five leaderboards -> independent metrics and sharing filter
one challenge -> derived progress without formal-state mutation
messages/encouragements -> pair-only and unread/read behavior
quiz -> result stored and formal review state unchanged
public content -> remains after user deletion
```

## Plan Self-Review

- **Spec coverage:** account/migration are Tasks 1–2; all existing data paths are Task 3; admin lifecycle is Task 4; cache/offline isolation is Task 5; five leaderboards/challenge are Task 6; messages/quizzes are Task 7; UI is Task 8; docs and full verification are Task 9.
- **Placeholder scan:** no unfinished markers or vague implementation steps are present.
- **Type consistency:** the current-user, admin, relationship, leaderboard, challenge, message and quiz interfaces are named once and reused by later tasks.
- **Review focus coverage:** all five high-risk cases in the header have explicit tests in Tasks 2–7.
- **Scope decision:** this is one plan because interaction endpoints must not ship before the account/session and data-isolation boundaries; the ordered tasks remain independently testable.


