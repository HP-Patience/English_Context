# Runtime Task 3 Report: Step4 Scheduling and SM-2 Sync

- **SHA:** `782215287c396595e4b66bf93b87a8761108f420`
- **Base SHA:** `198a103299e8c41a356fa87aeef2b53a3bc9569d`
- **Date:** 2026-08-21

## Files changed

- `src/lib/story-review.ts` — implements due-word selection, `vague`/remembered/forgotten result mapping, deterministic due ordering, transactional review submission, bounded conflict reload for idempotent concurrent duplicates, story round scheduling, and linked `UserWord`/`UserWordMeaning` SM-2 synchronization.
- `src/lib/story-review.test.ts` — adds focused TDD contract tests with a faithful fake Prisma repository, including regression coverage for `vague`, due ordering, and concurrent unique-conflict idempotency.
- `src/lib/sm2.ts` — previously made `calculateSM2` accept an optional `now` date while preserving the existing default behavior.

## RED / GREEN

### Original Task 3 RED

Command:

```bash
npm run test:runtime -- src/lib/story-review.test.ts
```

Observed expected failure before Task 3 implementation:

```text
FAIL src/lib/story-review.test.ts
Error: Cannot find module './story-review'
```

This failed because Task 3 review helpers did not exist yet.

### Review-fix RED

Command:

```bash
npm run test:runtime -- src/lib/story-review.test.ts
```

Observed expected failures after writing the review-fix tests and before production changes:

```text
Test Files  1 failed (1)
Tests  4 failed | 7 passed (11)
```

The failures covered the old `fuzzy` result identifier, missing due-time ordering, and lack of concurrent duplicate conflict reload.

### GREEN

Command:

```bash
npm run test:runtime -- src/lib/story-review.test.ts
```

Result after implementation:

```text
Test Files  1 passed (1)
Tests  11 passed (11)
```

## Validation

- Focused runtime test: `npm run test:runtime -- src/lib/story-review.test.ts` — PASS, 11 tests.
- Full runtime tests: `npm run test:runtime` — PASS, 3 files / 22 tests.
- Full story tests: `npm run test:story` — PASS, 54 tests.
- Typecheck: `npx tsc --noEmit` — PASS.
- Focused lint: `npx eslint src/lib/story-review.ts src/lib/story-review.test.ts src/lib/sm2.ts` — PASS.
- Diff check: `git diff --check` — PASS.
- Self-review: inspected the diff for Task 3 scope, conflict/idempotency behavior, `vague` contract usage, sorting semantics, and forbidden env/raw novel/API/UI/auth additions; no unrelated work found.

## Notes / concerns

- Runtime/API result identifiers are now exactly `remembered`, `vague`, and `forgotten`; `fuzzy` was removed from the story review runtime contract/tests.
- Story Step4 scheduling uses the existing SM-2 interval output for `UserStoryWordProgress.nextReviewAt`, so the five rounds remain cross-day reinforcement and round 5 completes with `nextReviewAt = null` without creating round 6.
- Due words are sorted by lesson order, then due time, then word order. First-pass words without `UserStoryWordProgress` intentionally sort as the deterministic earliest due items within their lesson.
- `submitStoryReview` keeps attempt creation, story word progress, and linked `UserWordMeaning`/`UserWord` mastery updates inside one Serializable Prisma transaction.
- Retryable Prisma unique/Serializable conflicts are handled with bounded retry/reload; a loser of a concurrent same-round submission returns the already committed attempt/result and does not double-apply SM-2.
- No API, UI, auth, environment, or raw novel reads were added.
