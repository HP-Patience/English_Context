# Runtime Task 3 Report: Step4 Scheduling and SM-2 Sync

- **SHA:** `f34a3cec8824bbed3c1c69e7328ce541b584b35c`
- **Base SHA:** `198a103299e8c41a356fa87aeef2b53a3bc9569d`
- **Date:** 2026-08-21

## Files changed

- `src/lib/story-review.ts` — added due-word selection, story result mapping, transactional review submission, story round scheduling, and linked `UserWord`/`UserWordMeaning` SM-2 synchronization.
- `src/lib/story-review.test.ts` — added focused TDD contract tests with a faithful fake Prisma repository.
- `src/lib/sm2.ts` — made `calculateSM2` accept an optional `now` date while preserving the existing default behavior.

## RED / GREEN

### RED

Command:

```bash
npm run test:runtime -- src/lib/story-review.test.ts
```

Observed expected failure before implementation:

```text
FAIL src/lib/story-review.test.ts
Error: Cannot find module './story-review'
```

This failed because Task 3 review helpers did not exist yet.

### GREEN

Command:

```bash
npm run test:runtime -- src/lib/story-review.test.ts
```

Result after implementation:

```text
Test Files  1 passed (1)
Tests  9 passed (9)
```

## Validation

- Focused runtime test: `npm run test:runtime -- src/lib/story-review.test.ts` — PASS, 9 tests.
- Full runtime tests: `npm run test:runtime` — PASS, 3 files / 20 tests.
- Full story tests: `npm run test:story` — PASS, 54 tests.
- Typecheck: `npx tsc --noEmit` — PASS.
- Focused lint: `npx eslint src/lib/story-review.ts src/lib/story-review.test.ts src/lib/sm2.ts` — PASS.
- Diff check: `git diff --check` — PASS.
- Self-review: checked Task 3 files for forbidden env/raw novel/API/UI/gloss coupling references; none found.

## Notes / concerns

- Story Step4 scheduling uses the existing SM-2 interval output for `UserStoryWordProgress.nextReviewAt`, so rounds are due across days and round 5 completes with `nextReviewAt = null`.
- `submitStoryReview` keeps story attempts, story word progress, and linked `UserWordMeaning`/`UserWord` mastery updates inside one Serializable Prisma transaction.
- Idempotent same-result retries for an already-recorded current round return the recorded round state instead of creating another attempt or round 6.
- No API, UI, auth, environment, or raw novel reads were added.