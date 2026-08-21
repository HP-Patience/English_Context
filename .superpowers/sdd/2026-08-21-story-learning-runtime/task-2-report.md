# Runtime Task 2 Report — Story Learning Runtime

Date: 2026-08-21
Worktree: `F:\english_context\.worktrees\story-learning`
Base SHA: `dd45be00c96fafe1061e6a651edcdde5ab048d4c`

## Scope implemented

- Added `src/lib/story-service.ts` with the Task 2 service contracts:
  - `listStoryLessons({ prisma, userId })`
  - `getStoryLesson({ prisma, userId, lessonId })`
  - `saveFirstPassStep({ prisma, userId, lessonId, step })`
- Added `src/lib/story-service.test.ts` with fake-Prisma TDD coverage for:
  - ready-course lookup via `StoryCourse.readySlot = "ready"`
  - ready lessons scoped to that one course only
  - draft/failed/archived-course lesson hiding
  - parsing content only after visibility filtering
  - ordered `StoryLessonWord` output with `word` and `meaning`
  - due-review count calculation
  - transaction-scoped sequential/idempotent first-pass saves
  - Step1 → Step3 jump rejection
- Repaired `scripts/lib/story-lesson-repository.mjs` so `findReadyCourse` now performs one unique-slot lookup and validates the returned row.
- Updated story repository/final-fix regression tests to reflect the final scoped re-review ruling that the unique ready slot, not global ready status scans, is the runtime publication selector.
- Fixed the Windows runtime test script from `vitest run src/lib/*.test.ts` to `vitest run src/lib` so the full runtime test command works in this PowerShell worktree.

## Binding/ruling closure

Closed the load-bearing residual from the final scoped re-review:

- Runtime service first calls `storyCourse.findUnique({ where: { readySlot: 'ready' } })`.
- Runtime lesson queries then use both `courseId: readyCourse.id` and `status: 'ready'`.
- Runtime does not query `StoryLesson` globally by status.
- Hidden draft/archived-course lessons are not parsed, so invalid hidden `contentJson` cannot leak as runtime errors.
- Repository `findReadyCourse` no longer performs two non-transactional status/slot reads.

## TDD evidence

### RED

```text
npm run test:runtime -- src/lib/story-service.test.ts
FAIL src/lib/story-service.test.ts
Error: Cannot find module './story-service'
```

```text
npm run test:story -- scripts/test/story-lesson-repository.test.mjs
fail 2
ready-course lookup uses the unique ready slot and validates the returned row
Error: ready-course lookup must not use non-transactional status/slot scans
```

### GREEN

```text
npm run test:runtime -- src/lib/story-service.test.ts
Test Files 1 passed
Tests 4 passed
```

```text
npm run test:story -- scripts/test/story-lesson-repository.test.mjs
pass 6
fail 0
```

## Final validation

```text
npm run test:runtime
Test Files 2 passed
Tests 11 passed
```

```text
npm run test:story
pass 54
fail 0
```

```text
npx tsc --noEmit
exit 0
```

```text
npx eslint src/lib/story-service.ts src/lib/story-service.test.ts scripts/lib/story-lesson-repository.mjs scripts/test/story-lesson-repository.test.mjs scripts/test/story-final-fixes.test.mjs
exit 0
```

## Self-review notes

- API routes, UI, authentication, env files, and raw novel files were not touched.
- The services return DTOs rather than Prisma objects; dates are serialized to ISO strings or `null`.
- First-pass writes use a transaction plus `(userId, lessonId)` upsert and preserve existing completed timestamps on idempotent retries.
- Step4 remains non-blocking: due-review counts are informational and first-pass completion sets the lesson to Step4 after Step3.

## Concerns / follow-ups

- `dueReviewCount` treats first-passed lesson words with no `UserStoryWordProgress` row as due for round 1. This matches the upcoming review-service shape, but Task 4 should keep the same convention when implementing `getDueStoryWords`.
- This task uses fake-Prisma contract tests only; live database behavior remains covered by Prisma validation/generation in the data-pipeline tasks and should be exercised by the later runtime smoke test.