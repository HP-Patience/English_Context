# Story Learning Runtime Implementation Plan

> **Superseded product constraint (2026-09-02):** ADR-0004 replaces this plan's sequential Step1-Step3 access locks and jump rejection. All `ready` lessons and Steps1-3 are freely accessible; dated completions are independent manual records. The remaining sections are retained as historical implementation context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent `/story` learning mode that presents each generated Gu Zhen Ren lesson through four steps, records non-blocking five-round reinforcement, and synchronizes review results with the existing SM-2 system.

**Architecture:** The runtime consumes only `ready` lessons produced by the data-pipeline plan. Server route handlers in `src/app/api/story` use small service modules for lesson queries, first-pass progress, and review scheduling; React client components render structured lesson segments and keep hover/pinned gloss state local to the page.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript, Prisma 5.22, Tailwind CSS, existing SM-2 helpers, Vitest for pure logic tests.

**Spec:** `docs/superpowers/specs/2026-08-21-gu-zhen-ren-story-vocab-design.md`

**Dependency:** Execute `docs/superpowers/plans/2026-08-21-gu-zhen-ren-story-data-pipeline.md` first so the Prisma models and `ready` lesson contract exist.

## Global Constraints

- Preserve `/learn`, `/review`, existing Word/Meaning/UserWord data, and existing SM-2 behavior.
- Story lessons are available only when `StoryLesson.status = 'ready'`.
- Completing Step3 marks the first pass and immediately allows the next lesson; Step4 never blocks new lessons.
- Step4 review is due-item based, not a same-session five-round requirement.
- Glosses are hidden by default, temporarily shown on hover, pinned on click, and hidden again on a second click; mobile uses tap toggling.
- A lesson can contain up to 100 target words, so UI must group content by scene and paginate or chunk long word lists.
- All progress mutations are scoped to `getLocalUserId()` and must be idempotent.
- Request-time route handlers never call the LLM to generate story content.

---

### Task 1: Add runtime test tooling and pure story contracts

**Files:**
- Modify: `package.json` (`test:runtime` script and Vitest dev dependency)
- Create: `vitest.config.ts`
- Create: `src/lib/story-types.ts`
- Create: `src/lib/story-progress.ts`
- Create: `src/lib/story-progress.test.ts`

**Interfaces:**
- `StoryLessonDocument` matches the validated JSON emitted by the data pipeline.
- `parseStoryContent(contentJson: string) -> StoryLessonDocument` throws a descriptive `Error` for invalid persisted JSON.
- `getNextStep(progress: StoryProgressState) -> 1 | 2 | 3 | 4`.
- `completeFirstPass(progress, step) -> StoryProgressState` advances only the requested completed step and sets `status = 'first_passed'` after Step3.
- `canOpenLesson(progress) -> boolean` returns true for `not_started`, `learning`, `first_passed`, and `reviewing`; it never requires five review rounds.

- [ ] **Step 1: Read the local Next.js guidance before runtime edits**

Read the relevant documentation under `node_modules/next/dist/docs/` for App Router pages, dynamic segments, route handlers, and request caching. Record any version-specific constraints in the implementation notes before adding route code.

- [ ] **Step 2: Add Vitest and write failing pure-logic tests**

Add the test script:

```json
"test:runtime": "vitest run src/lib/*.test.ts"
```

Write tests for initial progress, sequential Step1→Step3 completion, Step3 unlocking the next lesson, and Step4 not blocking access.

```ts
it('unlocks the next lesson after Step3 without five Step4 rounds', () => {
  const progress = completeFirstPass(
    completeFirstPass(
      completeFirstPass(initialProgress, 1),
      2,
    ),
    3,
  )
  expect(progress.status).toBe('first_passed')
  expect(canOpenLesson(progress)).toBe(true)
})
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `npm run test:runtime -- src/lib/story-progress.test.ts`

Expected: FAIL because the story types and progress functions do not exist.

- [ ] **Step 4: Implement the minimal types and progress functions**

Keep the functions pure and reject out-of-order completion. Do not put Prisma calls or browser state in this module.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `npm run test:runtime -- src/lib/story-progress.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/story-types.ts src/lib/story-progress.ts src/lib/story-progress.test.ts
git commit -m "test: add story runtime contracts and progress rules"
```

---

### Task 2: Implement story lesson and first-pass services

**Files:**
- Create: `src/lib/story-service.ts`
- Create: `src/lib/story-service.test.ts`

**Interfaces:**
- `listStoryLessons({ prisma, userId }) -> Promise<StoryLessonListItem[]>`.
- `getStoryLesson({ prisma, userId, lessonId }) -> Promise<StoryLessonDetail | null>`.
- `saveFirstPassStep({ prisma, userId, lessonId, step }) -> Promise<UserStoryProgressDto>`.
- `StoryLessonListItem` includes lesson order/title, source chapter range, target word count, current status, completed step, and due review count.
- `StoryLessonDetail` includes parsed `content`, ordered `lessonWords`, and user progress.

- [ ] **Step 1: Write failing service tests with a fake Prisma repository**

Cover ready-only filtering, order sorting, hidden failed/draft lessons, idempotent progress writes, and rejection of a step jump from Step1 to Step3.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test:runtime -- src/lib/story-service.test.ts`

Expected: FAIL because `story-service.ts` is absent.

- [ ] **Step 3: Implement the service functions**

Use the existing Prisma relation style. Always include `StoryLessonWord.word`, `StoryLessonWord.meaning`, and the current local user's progress. Parse `contentJson` only after the lesson has passed the status filter.

For progress writes, use `upsert` on `(userId, lessonId)`, preserve already completed timestamps, and return a DTO rather than a Prisma object.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test:runtime -- src/lib/story-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/story-service.ts src/lib/story-service.test.ts
 git commit -m "feat: add story lesson and first-pass services"
```

---

### Task 3: Implement Step4 scheduling and SM-2 synchronization

**Files:**
- Create: `src/lib/story-review.ts`
- Create: `src/lib/story-review.test.ts`
- Modify: `src/lib/sm2.ts` only if an exported pure helper is required by the service

**Interfaces:**
- `getDueStoryWords({ prisma, userId, lessonId? }) -> Promise<DueStoryWord[]>`.
- `submitStoryReview({ prisma, userId, lessonWordId, result }) -> Promise<StoryReviewResult>`.
- `mapStoryResultToGrade(result) -> 0 | 2 | 4`.
- `StoryReviewResult` includes `round`, `nextReviewAt`, `roundCompleted`, and updated mastery values.

- [ ] **Step 1: Write failing review tests**

Test result-to-grade mapping, round increments from 0 to 1 and 4 to 5, duplicate round submission idempotency, and a forgotten result resetting the SM-2 interval without resetting unrelated lesson words.

```ts
it('maps forgotten to SM-2 grade zero', () => {
  expect(mapStoryResultToGrade('forgotten')).toBe(0)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test:runtime -- src/lib/story-review.test.ts`

Expected: FAIL because review helpers are absent.

- [ ] **Step 3: Implement due selection and review submission**

Use `UserStoryWordProgress.nextReviewAt` for the story table and call the existing SM-2 calculation/update flow for the linked `UserWordMeaning`. Wrap attempt creation, word-progress update, and user-word mastery recalculation in one Prisma transaction. Enforce `(userId, lessonWordId, round)` uniqueness so retries are safe.

A successful first submission for a word creates round 1; later submissions require the next due round and never create round 6.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test:runtime -- src/lib/story-review.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/story-review.ts src/lib/story-review.test.ts src/lib/sm2.ts
 git commit -m "feat: schedule story reinforcement with SM-2"
```

---

### Task 4: Add story API route handlers

**Files:**
- Create: `src/app/api/story/lessons/route.ts`
- Create: `src/app/api/story/lessons/[id]/route.ts`
- Create: `src/app/api/story/lessons/[id]/progress/route.ts`
- Create: `src/app/api/story/lessons/[id]/words/route.ts`
- Create: `src/app/api/story/review/route.ts`
- Create: `src/lib/story-api-types.ts`

**Interfaces:**
- `GET /api/story/lessons` returns `{ lessons, currentLessonId, dueCount }`.
- `GET /api/story/lessons/[id]` returns one ready lesson or 404.
- `POST /api/story/lessons/[id]/progress` accepts `{ step: 1 | 2 | 3 }` and returns updated progress.
- `GET /api/story/lessons/[id]/words?query=&scene=` returns ordered/paginated word rows.
- `GET /api/story/review` returns due words grouped by lesson.
- `POST /api/story/review` accepts `{ lessonWordId, result: 'remembered' | 'vague' | 'forgotten' }` and returns the next review state.

- [ ] **Step 1: Write route contract tests around service mocks**

Test status codes and payload shapes for ready lesson, missing lesson, invalid step, invalid review result, unauthorized lesson word, and duplicate review submission.

- [ ] **Step 2: Run the route contract tests and verify they fail**

Run: `npm run test:runtime -- src/lib/story-api-types.test.ts`

Expected: FAIL because route contract helpers and handlers are absent.

- [ ] **Step 3: Implement route handlers using NextRequest/NextResponse**

Follow the project's existing `src/app/api/**/route.ts` style. Use `getLocalUserId()` on every handler, parse JSON bodies defensively, return `400` for invalid payloads, `404` for missing/unauthorized records, `409` for duplicate immutable round submissions, and `500` only for unexpected errors.

Do not expose `contentJson` from a non-ready lesson and do not include database connection details in errors.

- [ ] **Step 4: Run type checking and route tests**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run test:runtime`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/story src/lib/story-api-types.ts
 git commit -m "feat: add story lesson and review APIs"
```

---

### Task 5: Build the story course list page

**Files:**
- Create: `src/app/story/page.tsx`
- Create: `src/components/story/StoryCourseList.tsx`
- Create: `src/components/story/StoryCourseProgress.tsx`
- Modify: `src/components/NavBar.tsx`
- Modify: `src/app/page.tsx` to add a story-mode entry point

**Interfaces:**
- `StoryCourseList` consumes `StoryLessonListItem[]` and renders ordered lessons.
- Each lesson link targets `/story/[lessonId]` and shows first-pass status, current step, and due reinforcement count.
- `StoryCourseProgress` consumes `{ total, firstPassed, reinforcing, reinforced, dueCount }`.

- [ ] **Step 1: Add a page-level test fixture and failing rendering assertions**

Assert that ready lessons are ordered by `order`, a failed lesson is not rendered, and the current lesson has a distinct continuation action.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:runtime -- src/components/story/StoryCourseList.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the list and navigation entry**

Use the existing visual language: stone palette, rounded cards, dark mode classes, and `next/link`. Keep story mode visibly separate from ordinary `/learn`. Show a short note that Step4 reinforcement happens later and does not block the next lesson.

- [ ] **Step 4: Run component tests and lint**

Run: `npm run test:runtime -- src/components/story/StoryCourseList.test.tsx`

Expected: PASS.

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/story/page.tsx src/components/story/StoryCourseList.tsx src/components/story/StoryCourseProgress.tsx src/components/NavBar.tsx src/app/page.tsx
 git commit -m "feat: add story course list"
```

---

### Task 6: Build Step1–Step3 lesson experience

**Files:**
- Create: `src/app/story/[lessonId]/page.tsx`
- Create: `src/components/story/StoryLessonShell.tsx`
- Create: `src/components/story/StoryStepNav.tsx`
- Create: `src/components/story/StoryReader.tsx`
- Create: `src/components/story/StoryRecall.tsx`
- Create: `src/components/story/StoryWordList.tsx`
- Create: `src/components/story/StoryWordDetail.tsx`
- Create: `src/components/story/StoryLessonShell.test.tsx`

**Interfaces:**
- `StoryLessonShell({ lesson, progress, dueWords })` owns current step and calls the progress API.
- `StoryReader({ paragraphs, mode })` supports `mode = 'learn' | 'recall'`.
- `StoryRecall` renders target English words while hiding/revealing glosses and reports self-ratings.
- `StoryWordList` accepts `lessonWords`, `query`, and `scene` and renders the complete 60–100 word list in scene sections.

- [ ] **Step 1: Write failing component tests**

Test Step1 renders target words with glosses, Step2 renders target words with hidden glosses, Step3 renders all words grouped by scene, and completing Step3 calls the progress endpoint without requiring Step4.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:runtime -- src/components/story/StoryLessonShell.test.tsx`

Expected: FAIL because the story lesson components do not exist.

- [ ] **Step 3: Implement structured segment rendering**

Render text segments as text and target-word segments as a reusable word component. Do not use `dangerouslySetInnerHTML` for generated lesson content. Use a scene heading and paragraph spacing so a 100-word lesson remains readable.

Step2 keeps the English word visible and passes the gloss state to the reveal component. The initial version uses self-rating rather than forcing 100 text inputs; the component API leaves room for optional typed answers later.

- [ ] **Step 4: Implement sequential navigation**

Prevent Step2 before Step1 is completed and Step3 before Step2 is completed. Once Step3 is completed, render a clear “下一篇” action and keep a link to due Step4 reviews.

- [ ] **Step 5: Run component tests and type checking**

Run: `npm run test:runtime -- src/components/story/StoryLessonShell.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/story/[lessonId]/page.tsx src/components/story/StoryLessonShell.tsx src/components/story/StoryStepNav.tsx src/components/story/StoryReader.tsx src/components/story/StoryRecall.tsx src/components/story/StoryWordList.tsx src/components/story/StoryWordDetail.tsx src/components/story/StoryLessonShell.test.tsx
 git commit -m "feat: add story Step1 through Step3 learning flow"
```

---

### Task 7: Implement Step4 gloss reveal and due review table

**Files:**
- Create: `src/components/story/GlossReveal.tsx`
- Create: `src/components/story/StoryReviewTable.tsx`
- Create: `src/components/story/GlossReveal.test.tsx`
- Create: `src/components/story/StoryReviewTable.test.tsx`
- Modify: `src/components/story/StoryLessonShell.tsx`

**Interfaces:**
- `GlossReveal({ gloss, hidden, onTogglePinned })` exposes temporary hover visibility and persistent click visibility.
- `StoryReviewTable({ words, attempts, onSubmit })` renders columns 1–5 and only enables due words.
- `onSubmit({ lessonWordId, result })` calls `POST /api/story/review` and updates the local table without reloading the entire lesson.

- [ ] **Step 1: Write failing interaction tests**

Test the exact state machine:

```text
initial: hidden
mouseenter: visible, not pinned
mouseleave: hidden when not pinned
click: visible and pinned
mouseleave: visible when pinned
second click: hidden and unpinned
```

Also test that a touch click toggles directly and that a completed round is rendered in the matching 1–5 column.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:runtime -- src/components/story/GlossReveal.test.tsx src/components/story/StoryReviewTable.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the gloss reveal state machine**

Keep `isHovered` and `isPinned` independent:

```ts
const visible = isPinned || isHovered

function handleClick() {
  setIsPinned((value) => !value)
}
```

Use `onMouseEnter`, `onMouseLeave`, `onFocus`, `onBlur`, and keyboard activation. Add `aria-expanded`, a button role, and an accessible label. On touch devices, the click handler is the only state change.

- [ ] **Step 4: Implement due-item review table behavior**

Render the full word list but disable future rounds and non-due words. The Chinese gloss cell uses `GlossReveal`. After a result is submitted, update the row's completed round and show the returned next due date. Do not mark a word remembered merely because its gloss was revealed.

- [ ] **Step 5: Run interaction tests and lint**

Run: `npm run test:runtime -- src/components/story/GlossReveal.test.tsx src/components/story/StoryReviewTable.test.tsx`

Expected: PASS.

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/story/GlossReveal.tsx src/components/story/StoryReviewTable.tsx src/components/story/GlossReveal.test.tsx src/components/story/StoryReviewTable.test.tsx src/components/story/StoryLessonShell.tsx
 git commit -m "feat: add non-blocking Step4 reinforcement table"
```

---

### Task 8: Verify runtime integration and production build

**Files:**
- Modify: `README.md` with story-mode route and local seed instructions if needed
- Create: `scripts/test/story-runtime-smoke.mjs`

**Interfaces:**
- The smoke test uses a ready fixture lesson and verifies list → detail → Step1–Step3 → due Step4 review.
- The runtime does not require the raw novel file once ready lesson rows exist.

- [ ] **Step 1: Write the failing smoke test**

Assert that a seeded ready lesson is returned by `/api/story/lessons`, its detail endpoint returns structured paragraphs, Step3 progress is persisted, and a review submission returns round 1 with a future due time.

- [ ] **Step 2: Run it before wiring the full runtime**

Run: `npm run test:runtime -- scripts/test/story-runtime-smoke.mjs`

Expected: FAIL because the complete route/UI flow is not yet connected.

- [ ] **Step 3: Add the fixture seed and smoke runner**

Use a temporary database schema or a transaction-scoped test Prisma client. Seed one ready lesson, two lesson words, one local user, and linked meanings. Do not use the real novel or production database.

- [ ] **Step 4: Run all runtime checks**

Run:

```bash
npm run test:runtime
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 5: Run manual browser verification**

Start the app with `npm run dev`, open `/story`, and verify:

1. The course list shows ready lessons in order.
2. Step1 renders structured scenes and highlighted words.
3. Step2 hides glosses until hover/click.
4. Clicking a gloss keeps it visible after mouseleave; clicking again hides it.
5. Step3 unlocks the next lesson.
6. Step4 shows due words only and writes the result to the correct round column.
7. Refreshing preserves progress.
8. `/learn` and `/review` still work.

- [ ] **Step 6: Commit**

```bash
git add README.md scripts/test/story-runtime-smoke.mjs
 git commit -m "test: verify story learning runtime end to end"
```
