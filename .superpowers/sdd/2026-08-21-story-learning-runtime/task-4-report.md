# Runtime Task 4 Report

**Date:** 2026-08-21
**Worktree:** `F:\english_context\.worktrees\story-learning`
**Branch:** `feature/story-learning`
**Base SHA:** `ccb73b90e6a9df90bddfa326c5c4b6e8be970f8b`
**Implementation commit:** `c75e6ec` (`feat: add story lesson and review APIs`)
**Review-fix commit:** `7075689b42c65181049da7e65c4872ff56bff5b4` (`fix: classify story API errors by stable codes`)

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

## Review follow-up: stable domain error classification

The Task 4 review identified message-regex HTTP classification as a Medium quality issue. The follow-up replaces it with `StoryDomainError` and exported `STORY_ERROR_CODES` shared by first-pass progress, story services, review services, and the API classifier.

- API status selection now depends only on a recognized `StoryDomainError` code, never on mutable message text.
- Ready-course/lesson/lesson-word visibility and pre-Step3 reviewability codes map to `404`.
- Progress sequencing, not-due/completed review state, immutable-round result conflicts, and exhausted retryable transaction conflicts map to `409`.
- Plain infrastructure errors, objects that merely expose a lookalike `code`, and infrastructure messages containing old domain phrases map to generic `500` responses.
- Identical duplicate review submissions still return the existing idempotent `200` result.
- A duplicate immutable-round submission with a different result now emits the stable review-result conflict code and remains `409`.
- Three exhausted retryable Prisma/transaction conflicts now emit `STORY_REVIEW_RETRY_EXHAUSTED`, which maps to `409` without exposing the underlying database error.

## Files

Created:

- `src/app/api/story/lessons/route.ts`
- `src/app/api/story/lessons/[id]/route.ts`
- `src/app/api/story/lessons/[id]/progress/route.ts`
- `src/app/api/story/lessons/[id]/words/route.ts`
- `src/app/api/story/review/route.ts`
- `src/lib/story-api-types.ts`
- `src/lib/story-api-types.test.ts`
- `src/lib/story-errors.ts`

Modified:

- `src/lib/story-progress.ts`
- `src/lib/story-service.ts`
- `src/lib/story-service.test.ts`
- `src/lib/story-review.ts`
- `src/lib/story-review.test.ts`

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

### Review follow-up RED 1 — shared typed errors absent

Command:

```text
npm run test:runtime -- src/lib/story-api-types.test.ts src/lib/story-service.test.ts src/lib/story-review.test.ts
```

Observed failure:

```text
Test Files 3 failed
Cannot find module './story-errors'
```

### Review follow-up RED 2 — immutable-round conflict used the not-due code

Command:

```text
npm run test:runtime -- src/lib/story-review.test.ts
```

Observed failure:

```text
Expected: STORY_REVIEW_RESULT_CONFLICT
Received: STORY_REVIEW_NOT_DUE
```

### Review follow-up GREEN

```text
npm run test:runtime -- src/lib/story-api-types.test.ts src/lib/story-service.test.ts src/lib/story-review.test.ts
Test Files 3 passed
Tests 40 passed
```

## Final validation

All checks passed after the review fix:

```text
npm run test:runtime -- src/lib/story-api-types.test.ts
Test Files 1 passed
Tests 20 passed

npm run test:runtime -- src/lib/story-service.test.ts src/lib/story-review.test.ts
Test Files 2 passed
Tests 20 passed

npm run test:runtime
Test Files 4 passed
Tests 47 passed

npm run test:story
54 passed / 0 failed

npx tsc --noEmit
exit 0

npx eslint src/app/api/story src/lib/story-errors.ts src/lib/story-api-types.ts src/lib/story-api-types.test.ts src/lib/story-progress.ts src/lib/story-progress.test.ts src/lib/story-service.ts src/lib/story-service.test.ts src/lib/story-review.ts src/lib/story-review.test.ts
exit 0

npm run build
Next.js 16.2.9 production build passed; 38 static pages generated and all story API routes were included.

git diff --check
exit 0
```

The build emitted only the pre-existing workspace-root inference warning caused by multiple lockfiles; it did not fail the build.

## Self-review

- Confirmed every read remains bound to the unique ready-course publication rules through `listStoryLessons`, `getStoryLesson`, `listStoryLessonWords`, or `getDueStoryWords`.
- Confirmed hidden/non-ready lesson content is not parsed by the word-list helper; the service returns `null` before touching `contentJson`.
- Confirmed routes do not expose raw database errors or connection details in HTTP responses.
- Confirmed HTTP classification is based only on shared typed domain codes; message lookalikes and untrusted code-shaped objects return `500`.
- Confirmed retry exhaustion and conflicting immutable-round submissions return `409`, while identical retries remain idempotent `200`.
- Confirmed Step 4 remains due-item based and does not block lesson progression.
- Confirmed no authentication layer, environment-file read, LLM call, raw-novel access, or direct unsafe route-level story-table query was added.
- Confirmed existing `/learn`, `/review`, and SM-2 behavior were not changed.

## Decisions and concerns

- Domain messages remain descriptive for logs and tests, but they are no longer part of the HTTP contract; exported error codes are the stable boundary.
- `StoryDomainError` uses an `instanceof` guard so arbitrary infrastructure errors or code-shaped objects cannot opt themselves into a `404`/`409` response.
- Deep relative imports are used for `story-api-types` in dynamic Route Handler files because the current Vitest route-contract setup does not resolve an otherwise-unmocked `@/lib/story-api-types` alias. Type checking, lint, and production build pass.
- The production build reports the repository's existing multiple-lockfile workspace-root warning. No Task 4 build failure or functional blocker remains.

## Scoped re-review round 2 — trusted Prisma retry classification

### Review finding

The review retry loop still accepted arbitrary `code` properties and message fragments such as `transaction conflict`, `unique constraint`, or `deadlock`. A plain object such as `{ code: 'P2002' }` or an unrelated infrastructure `Error` with a lookalike message could therefore be retried three times and replaced with `STORY_REVIEW_RETRY_EXHAUSTED`, incorrectly producing HTTP `409` instead of a generic `500`.

### Fix

- `isRetryableStoryReviewConflict` now accepts only verified `Prisma.PrismaClientKnownRequestError` instances.
- Only Prisma known request codes `P2002` and `P2034` are retryable.
- Message matching, plain code-shaped objects, and the unverified `40001` shape fallback were removed.
- No test-only predicate was needed because tests construct the real Prisma known request error class.
- Real `P2002` still supports the concurrent identical-retry path and returns the committed result without reapplying SM-2.
- Real `P2034` still retries three times; exhaustion becomes the typed `STORY_REVIEW_RETRY_EXHAUSTED` domain error and remains HTTP `409`.
- Arbitrary message lookalikes and plain `P2002`/`P2034` objects propagate unchanged from the service and remain generic HTTP `500` at the route boundary.

### Round 2 TDD evidence

RED command:

```text
npm run test:runtime -- src/lib/story-review.test.ts src/lib/story-api-types.test.ts
```

Observed before the implementation change:

```text
Test Files 1 failed | 1 passed
Tests 3 failed | 34 passed

The message-lookalike, plain-P2002, and plain-P2034 service regressions each received
STORY_REVIEW_RETRY_EXHAUSTED instead of the original infrastructure error.
```

Focused GREEN:

```text
npm run test:runtime -- src/lib/story-review.test.ts src/lib/story-api-types.test.ts
Test Files 2 passed
Tests 37 passed
```

### Round 2 validation

```text
npm run test:runtime
Test Files 4 passed
Tests 51 passed

npm run test:story
54 passed / 0 failed

npx tsc --noEmit
exit 0

npx eslint src/lib/story-review.ts src/lib/story-review.test.ts src/lib/story-api-types.test.ts src/app/api/story/review/route.ts
exit 0

npm run build
Next.js 16.2.9 production build passed; 38 static pages generated and all story API routes were included.

git diff --check
exit 0
```

The build again emitted only the pre-existing multiple-lockfile workspace-root inference warning.

### Round 2 self-review

- Confirmed the retry decision no longer reads mutable error messages or trusts arbitrary code-bearing objects.
- Confirmed real Prisma `P2002` and `P2034` instances are the only retryable error cases.
- Confirmed identical duplicate retries remain idempotent `200` and immutable-round result conflicts remain typed `409` responses.
- Confirmed retry exhaustion remains a typed `409`, while lookalike infrastructure failures remain generic `500` responses without leaked details.
- Confirmed the change is limited to the story-review retry boundary and its service/route regression tests.
