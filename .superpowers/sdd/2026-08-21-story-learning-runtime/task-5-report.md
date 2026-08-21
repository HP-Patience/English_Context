# Runtime Task 5 Report

**Date:** 2026-08-21
**Worktree:** `F:\english_context\.worktrees\story-learning`
**Branch:** `feature/story-learning`
**Base SHA:** `a48d75ceffdfc2dae398812cb576bf7e1c5aafd5`
**Implementation commit:** `26c62313f8ed7713b950ceb990839bfc44c982c5` (`feat: add story course list`)

## Scope completed

Implemented the `/story` course list and additive entry navigation for Runtime Task 5.

- Added a Next.js 16 async Server Component at `/story`.
- The page calls `getLocalUserId()` and `listStoryLessons({ prisma, userId })` directly, so it consumes the existing service/API contract without an unnecessary browser fetch or internal HTTP request.
- Added `await connection()` from `next/server` to make the user-specific Prisma page request-rendered rather than attempting database work during static prerendering.
- Orders lessons by `order` and identifies the current continuation as the first ordered lesson whose first pass has not completed Step 3.
- Renders only ready-course lesson data. The service remains the publication boundary, and the list component also rejects explicit draft, failed, or archived fixture inputs defensively.
- Added a progress ledger for total lessons, first-pass completion, reinforcement in progress, reinforced lessons, and due-word count.
- Added a visible note that Step 4 reinforcement happens later according to due time and does not block the next lesson.
- Added lesson actions targeting `/story/[lessonId]`, with the current lesson receiving a distinct continuation treatment and `aria-current="step"`.
- Added separate `/story` entry points to the home page and desktop/mobile navigation while preserving ordinary `/learn` and `/review` flows.
- Used the existing stone palette and dark-mode language with serif chronicle typography and restrained red seal accents; no generic gradient treatment was added.
- Added responsive card layouts, semantic lists/articles/headings, an accessible progressbar and empty state, visible focus rings, and minimum-height primary actions suitable for touch.

## Files

Created:

- `src/app/story/page.tsx`
- `src/app/story/page.test.tsx`
- `src/components/story/StoryCourseList.tsx`
- `src/components/story/StoryCourseList.test.tsx`
- `src/components/story/StoryCourseProgress.tsx`
- `src/components/story/StoryNavigation.test.tsx`

Modified:

- `src/app/page.tsx`
- `src/components/NavBar.tsx`
- `vitest.config.ts`
- `package.json`
- `package-lock.json`

The dependency/config changes add only the jsdom React component-test support required by this task: `@testing-library/react`, `@testing-library/jest-dom`, a direct `jsdom` dependency, and the existing `@` source alias in Vitest.

The home-page edit also replaces two lint-blocking `any` types with local stats interfaces and moves the learn-prefetch timeout into a `useRef`; existing learning and review behavior is otherwise unchanged.

## Strict TDD evidence

Tests were authored before each corresponding implementation behavior.

### RED 1 — course components did not exist

Command:

```text
npm run test:runtime -- src/components/story/StoryCourseList.test.tsx
```

Observed failure: Vitest could not resolve `StoryCourseList`/`StoryCourseProgress` because the components had not been created. The failing assertions already specified ordered ready lessons, hidden failed material, current continuation treatment, lesson links, progress summary, and the non-blocking Step 4 note.

### RED 2 — additive navigation was absent

Command:

```text
npm run test:runtime -- src/components/story/StoryNavigation.test.tsx
```

Observed failure: the NavBar had no `/story` link and the home page had no separate story-course action. The test also asserted that `/review` remained available.

### RED 3 — server page did not exist

Command:

```text
npm run test:runtime -- src/app/story/page.test.tsx
```

Observed failure: `/story/page.tsx` could not be resolved. The test contract required local-user lookup, direct service invocation, aggregate progress, and a current lesson link.

### RED 4 — request-time rendering was not declared

After the initial page implementation, the page test was tightened to require Next.js 16 `connection()`. It failed because `connection()` had not yet been called. Adding `await connection()` made the test pass and prevented Prisma access during production prerendering.

### Focused GREEN

```text
npm run test:runtime -- src/components/story/StoryCourseList.test.tsx src/components/story/StoryNavigation.test.tsx src/app/story/page.test.tsx
```

Result:

```text
Test Files  3 passed (3)
Tests       7 passed (7)
```

## Final validation

```text
npm run test:runtime
Test Files  4 passed (4)
Tests       51 passed (51)

npm run test:story
54 passed / 0 failed

npx tsc --noEmit
exit 0

npx eslint src/app/story/page.tsx src/app/story/page.test.tsx src/components/story/StoryCourseList.tsx src/components/story/StoryCourseList.test.tsx src/components/story/StoryCourseProgress.tsx src/components/story/StoryNavigation.test.tsx src/components/NavBar.tsx src/app/page.tsx vitest.config.ts
exit 0

npm run build
Next.js 16.2.9 production build passed.
/story was reported as ƒ Dynamic (server-rendered on demand).

 git diff --check
exit 0
```

The build emitted the repository's existing workspace-root inference warning because the main checkout and worktree both contain lockfiles. It did not fail the build.

A local browser smoke request reached `/story`, but this worktree has no `DATABASE_URL`, so live Prisma-backed rendering stopped at the existing `getLocalUserId()` boundary. The Server Component is covered with mocked service-level RTL tests, and the production build completes with `/story` correctly classified as dynamic. No environment file or credential was read to work around the missing local database configuration.

## Self-review

- Confirmed the page is a Server Component and does not add client-side story fetching.
- Confirmed the unique ready-course service remains the primary publication boundary.
- Confirmed lessons are ordered before current-lesson and progress calculations.
- Confirmed draft, failed, and archived fixture rows are not rendered.
- Confirmed lesson cards expose status, current step, due reinforcement count, and `/story/[lessonId]` navigation.
- Confirmed current continuation is visually and semantically distinct.
- Confirmed Step 4 is presented as later, due-based, and non-blocking.
- Confirmed desktop and mobile NavBar menus retain review, search, stats, bookmarks, and settings while adding story mode.
- Confirmed the home page retains the ordinary learning stages and review action while adding a separate story-mode card.
- Confirmed light/dark classes, mobile stacking, focus-visible states, semantic landmarks, accessible labels, and touch-sized actions are present.
- Confirmed no raw novel body, draft lesson content, archived content, LLM call, or new story-table query was exposed.

## Security and dependency concerns

`npm audit --omit=dev` currently reports four high-severity advisories involving the pinned Next.js 16.2.9 dependency and transitive `postcss`, `sharp`, and `brace-expansion` packages.

Full `npm audit` reports six vulnerabilities: one moderate and five high, additionally including development dependency paths such as `js-yaml`.

The proposed complete audit fix upgrades Next.js to 16.3.2, outside this task's pinned dependency range and outside Runtime Task 5 scope. No automatic audit fix was applied. These advisories should be handled in a dedicated dependency-upgrade task with regression validation.

## Remaining concerns

- Live visual/data smoke testing requires a configured `DATABASE_URL` and a published ready course; neither was available in this worktree session.
- The multiple-lockfile Next.js workspace-root warning remains pre-existing and non-blocking.
- Dependency advisories remain open as documented above; they are not introduced by story data exposure and were not force-fixed in this scoped change.
