# Runtime Task 4 Report

**Date:** 2026-08-21
**Worktree:** `F:\english_context\.worktrees\story-learning`
**Branch:** `feature/story-learning`
**Base SHA:** `ccb73b90e6a9df90bddfa326c5c4b6e8be970f8b`
**Implementation commit:** `c75e6ec` (`feat: add story lesson and review APIs`)

## Scope completed

Implemented the Task 4 story-learning Route Handler contract with service-layer ready-course boundaries and local-user scoping:

- `GET /api/story/lessons`
  - Returns `{ lessons, currentLessonId, dueCount }`.
  - Selects the first ordered lesson whose first pass has not completed Step 3.
- `GET /api/story/lessons/[id]`
  - Returns one lesson from the unique ready course or `404`.
- `POST /api/story/lessons/[id]/progress`
  - Defensively accepts only `{ step: 1 | 2 | 3 }`.
  - Preserves service idempotency and maps sequencing conflicts to `409`.
- `GET /api/story/lessons/[id]/words`
  - Supports trimmed `query` and `scene` filters plus validated `page`/`pageSize` pagination.
  - Defaults to page 1 and page size 25, caps page size at 100, preserves lesson-word order, and attaches scene titles.
  - Uses a ready-scoped service helper; routes do not read lesson JSON or query story tables directly.
- `GET /api/story/review`
  - Returns due words grouped by lesson without changing service ordering.
  - Supports an optional validated `lessonId` filter.
- `POST /api/story/review`
  - Accepts `remembered | vague | forgotten`; rejects `fuzzy`.
  - Returns idempotent success for an identical retry.
  - Maps unauthorized/non-ready/pre-Step3 words to `404`, conflicting immutable/current-round submissions to `409`, and unexpected errors to a generic `500` payload.

All five handlers call `getLocalUserId()`. Dynamic route `params` are typed as promises and awaited as required by Next.js 16. Route Handlers remain uncached by default; no unnecessary cache directive was added.

## Files

Created:

- `src/app/api/story/lessons/route.ts`
- `src/app/api/story/lessons/[id]/route.ts`
- `src/app/api/story/lessons/[id]/progress/route.ts`
- `src/app/api/story/lessons/[id]/words/route.ts`
- `src/app/api/story/review/route.ts`
- `src/lib/story-api-types.ts`
- `src/lib/story-api-types.test.ts`

Modified:

- `src/lib/story-service.ts`
- `src/lib/story-service.test.ts`

## Strict TDD evidence

### RED 1 — route contracts before handlers/types

Command:

```text
npm run test:runtime -- src/lib/story-api-types.test.ts
```

Observed failure:

```text
FAIL
Cannot find module '/src/app/api/story/lessons/route'
```

This established that the route contract suite failed because the Task 4 handlers were absent.

### RED 2 — service helper tests before implementation

Command:

```text
npm run test:runtime -- src/lib/story-service.test.ts
```

Observed failure:

```text
Tests 2 failed | 4 passed
TypeError: listStoryLessonWords is not a function
```

This established the missing ready-scoped word-list helper before production implementation.

### GREEN — focused implementation loop

Command:

```text
npm run test:runtime -- src/lib/story-service.test.ts src/lib/story-api-types.test.ts
```

Result:

```text
Test Files 2 passed
Tests 22 passed
```

Final focused route contract rerun:

```text
npm run test:runtime -- src/lib/story-api-types.test.ts
Test Files 1 passed
Tests 16 passed
```

## Final validation

All checks passed on the committed implementation:

```text
npm run test:runtime
Test Files 4 passed
Tests 40 passed

npm run test:story
54 passed / 0 failed

npx tsc --noEmit
exit 0

npx eslint src/app/api/story src/lib/story-api-types.ts src/lib/story-api-types.test.ts src/lib/story-service.ts src/lib/story-service.test.ts
exit 0

git diff --check
exit 0
```

## Self-review

- Confirmed every read remains bound to the unique ready-course publication rules through `listStoryLessons`, `getStoryLesson`, `listStoryLessonWords`, or `getDueStoryWords`.
- Confirmed hidden/non-ready lesson content is not parsed by the word-list helper; the service returns `null` before touching `contentJson`.
- Confirmed routes do not expose raw database errors or connection details in HTTP responses.
- Confirmed Step 4 remains due-item based and does not block lesson progression.
- Confirmed no authentication layer, environment-file read, LLM call, raw-novel access, or direct unsafe route-level story-table query was added.
- Confirmed existing `/learn`, `/review`, and SM-2 behavior were not changed.

## Decisions and concerns

- Expected service failures are currently classified from the established service error-message semantics. Tests cover every required `404`/`409` distinction, including identical duplicate success versus conflicting immutable-round submission. A future refactor could replace message classification with typed domain errors, but this is not a blocker for Task 4.
- Deep relative imports are used for `story-api-types` in dynamic Route Handler files because the current Vitest route-contract setup does not resolve an otherwise-unmocked `@/lib/story-api-types` alias. Type checking and focused lint both pass.
- No known functional blockers remain.
