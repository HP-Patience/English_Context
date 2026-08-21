# Whole-Branch Final Fix Report

**Date:** 2026-08-21
**Fix base:** `8986ece66f52f4dc646c5f57294b76c885155e21`
**Implementation commit:** `d1f20f07ddcb39c774c4f4ea57e67a8cd139d926`
**Branch:** `feature/story-learning`

## Scope

This single final-fix dispatch addressed exactly the four Important whole-branch review invariants:

1. Lesson-level Step4 status transitions.
2. Explicit immutable review-round identity and retry/concurrency semantics.
3. Server-enforced sequential lesson unlocking.
4. Transactional destructive vocabulary reset.

The Minor draft-phonetic staging observation was deliberately left untouched. No production database, LLM, deployment, push, merge, or environment-secret inspection was performed.

## Implemented fixes

### 1. Step4 now advances persisted lesson status transactionally

- The first successful Step4 review updates the current lesson's existing `UserStoryProgress` from `first_passed` to `reviewing` in the same Serializable transaction as the review attempt, story-word schedule, and ordinary mastery updates.
- After each newly committed review, the transaction reloads every target word for that lesson and sets the lesson to `reinforced` only when every target word has `reviewRoundCompleted === 5`.
- Status updates are guarded so `reinforced` is never regressed.
- Immutable duplicate retries return their stored response before any status, schedule, SM-2, or mastery mutation.
- The story runtime smoke now verifies that the first Step4 result is persisted as lesson status `reviewing`.
- Review persistence tests verify incomplete lessons remain `reviewing`, the final round-5 target word produces `reinforced`, and an identical retry leaves all persisted review/mastery state unchanged.
- Course-page coverage verifies aggregate reinforcement counts are derived from persisted lesson `status` (`reinforced` contributes to “已强化”, while `first_passed`/`reviewing` contribute to “强化中”).

### 2. Review POST has an explicit immutable round identity

- The POST contract now requires `round`, an integer from 1 through 5, alongside `lessonWordId` and `result`.
- The review table submits its displayed actionable round, and the lesson shell rejects a stale local action whose round no longer matches the currently actionable row.
- The server performs the unique `(userId, lessonWordId, submittedRound)` attempt lookup before current progress/due-state evaluation.
- If that attempt already exists:
  - the same result returns the attempt's immutable stored response snapshot;
  - a different result returns `STORY_REVIEW_RESULT_CONFLICT` / HTTP 409.
- A new attempt is accepted only when `submittedRound` is exactly the next persisted round and the word is currently due. Future, skipped, stale non-existing, already-complete, and not-due submissions reject without mutation.
- `StoryReviewAttempt` now stores the immutable response fields `nextReviewAt`, `grade`, `userWordMeaningMastery`, and `userWordMastery`.
- P2002/P2034 recovery reloads the exact submitted round. Attempt creation precedes the SM-2 persistence writes inside the transaction, so a losing unique race rolls back rather than applying SM-2 twice.
- Identical concurrent same-round submissions converge on the committed immutable response.
- A compatibility path exists only for old snapshotless attempts that are still the current persisted round. A delayed snapshotless attempt rejects rather than fabricating a response from later state.
- The response parser accepts canonical historical ISO timestamps because a delayed immutable replay may legitimately return an already-past `nextReviewAt`; it still rejects malformed/noncanonical dates and requires round 5 to return `null`.

### 3. Sequential lesson unlocking is centralized and enforced server-side

- `storyLessonUnlockStates` is the single policy implementation for the current unique ready course and current user:
  - ready lesson order 1 is open;
  - a later ready lesson is open only when the immediately preceding ready lesson has first-pass Step3 completion;
  - a user's own already-Step3-completed legacy lesson remains accessible;
  - Step4 status does not gate unlocking.
- The policy is applied to:
  - lesson-list DTOs through truthful `isUnlocked` values;
  - lesson detail reads;
  - lesson word-list reads through the detail service;
  - first-pass progress writes inside their Serializable transaction.
- Locked reads/writes throw the typed `STORY_LESSON_LOCKED` domain error. Detail GET, words GET, and progress POST return HTTP 403 with the stable payload:

  ```json
  {
    "error": "Story lesson is locked",
    "code": "STORY_LESSON_LOCKED"
  }
  ```

- Course and user scoping prevent progress from another user or archived/non-ready course from unlocking the ready course.
- The course UI renders locked lessons as non-links with `完成上一篇第三步后解锁`.
- `/story` chooses the current lesson only from unlocked incomplete lessons.
- `/story/[lessonId]` offers a next lesson only if that later lesson is currently unlocked.
- Next.js 16 dynamic route/page `params` remain typed as promises and are awaited.

### 4. Vocabulary reimport reset is destructive, explicit, and atomic

- Added the testable `destructiveVocabularyReset` function and a named frozen reset-order contract.
- Every delete runs inside one interactive Prisma transaction in this FK-safe order:

  1. `storyReviewAttempt`
  2. `userStoryWordProgress`
  3. `userStoryProgress`
  4. `storyLessonWord`
  5. `storyLesson`
  6. `storyCourse`
  7. `reviewLog`
  8. `reviewSession`
  9. `generatedSentence`
  10. `userWordMeaning`
  11. `userWord`
  12. `meaning`
  13. `wordGroupItem`
  14. `wordGroup`
  15. `word`

- A thrown delete aborts the transaction, so no staged clear is committed.
- `scripts/import-new.js` now delegates to the testable import runner, invokes the destructive reset before the first database insert, and disconnects in `finally`.
- Existing vocabulary parsing, explicit phonetic import, word creation, user-word creation, and group ordering behavior were preserved.
- README now warns that vocabulary reimport/reset deletes published and draft story courses, lessons, lesson-word links, first-pass history, Step4 word progress, and review attempts.

## TDD evidence

### Genuine RED

The focused tests were written before the corresponding implementation changes and failed for the missing invariants:

| Area / command | RED result | Missing behavior demonstrated |
|---|---:|---|
| `npm run test:runtime -- src/lib/story-review.test.ts` | 20 tests: 16 passed, 4 failed | no `reviewing` transition; no `reinforced` transition; delayed round-1 replay used mutable round-2 state; conflicting delayed replay did not reject |
| `npm run test:runtime -- src/lib/story-service.test.ts` | 13 tests: 10 passed, 3 failed | no public unlock state; locked detail/write bypass; missing legacy/cross-course semantics |
| Focused API/UI runtime set | 44 tests: 35 passed, 9 failed | no explicit round parser/submission; locked routes returned 500; locked lessons remained links |
| `npm run test:story -- scripts/test/import-new-reset.test.mjs scripts/test/schema-contract.test.mjs` | 9 tests: 8 passed, 1 failed | destructive reset module did not exist |
| `npm run test:story -- scripts/test/schema-contract.test.mjs` | 8 tests: 7 passed, 1 failed | immutable attempt snapshot fields absent |
| `npm run test:runtime -- src/lib/story-api-types.test.ts` | 31 tests: 30 passed, 1 failed | delayed immutable response with a historical canonical date was incorrectly rejected |
| `npm run test:runtime -- src/app/story/[lessonId]/page.test.tsx` | 4 tests: 3 passed, 1 failed | locked later lesson was still offered as next navigation |

During final focused verification, one old shell test still asserted that every past `nextReviewAt` must be rejected. The 9-file run was 102 tests: 101 passed, 1 failed. That assertion contradicted the immutable delayed-replay contract, so it was replaced with coverage that accepts a canonical stored historical schedule and verifies the explicit `{ lessonWordId, round, result }` POST body. The shell file then passed 16/16.

### GREEN

| Verification | Result |
|---|---:|
| Complete focused runtime/API/component/page/smoke run | 9 files, 101/101 tests passed |
| Focused import reset + schema contract | 11/11 tests passed |
| Full `npm run test:runtime` | 5 files, 76/76 tests passed |
| Full `npm run test:story` | 67/67 tests passed |
| `npx tsc --noEmit` | passed, no diagnostics |
| `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder npx prisma validate` | schema valid |
| Same placeholder + `npx prisma generate` | Prisma Client 5.22.0 generated successfully |
| Changed-file ESLint | 27 changed JS/MJS/TS/TSX files, 0 problems |
| Full `npm run lint` | expected pre-existing baseline only: 130 problems (36 errors, 94 warnings) |
| `npm run build` | passed; Next.js 16.2.9; 39/39 static pages generated |
| `git diff --check` / staged diff check | passed |

The build emitted only the known multiple-lockfile workspace-root inference warning.

## Changed files

### Runtime, domain, API, and schema

- `prisma/schema.prisma`
- `src/lib/story-errors.ts`
- `src/lib/story-api-types.ts`
- `src/lib/story-review.ts`
- `src/lib/story-service.ts`
- `src/app/api/story/lessons/[id]/route.ts`
- `src/app/api/story/lessons/[id]/words/route.ts`
- `src/app/api/story/lessons/[id]/progress/route.ts`

### UI and pages

- `src/components/story/StoryReviewTable.tsx`
- `src/components/story/StoryLessonShell.tsx`
- `src/components/story/StoryCourseList.tsx`
- `src/app/story/page.tsx`
- `src/app/story/[lessonId]/page.tsx`

### Import/reset and documentation

- `scripts/import-new.js`
- `scripts/lib/destructive-vocabulary-reset.js`
- `scripts/lib/import-new-runner.js`
- `README.md`

### Tests and fakes

- `src/lib/story-review.test.ts`
- `src/lib/story-service.test.ts`
- `src/lib/story-api-types.test.ts`
- `src/components/story/StoryReviewTable.test.tsx`
- `src/components/story/StoryLessonShell.test.tsx`
- `src/components/story/StoryCourseList.test.tsx`
- `src/app/story/page.test.tsx`
- `src/app/story/[lessonId]/page.test.tsx`
- `scripts/test/helpers/fake-story-prisma.mjs`
- `scripts/test/import-new-reset.test.mjs`
- `scripts/test/schema-contract.test.mjs`
- `scripts/test/story-runtime-smoke.mjs`

## Self-review

- **Ready-course scoping:** Review and unlocking queries remain bound to the unique `readySlot: "ready"` course and ready lessons.
- **User scoping:** Unlock, lesson progress, word progress, attempts, and ordinary mastery reads/writes include the current user; another user's progress cannot unlock a lesson.
- **Sequential unlocking:** The immediately previous ready lesson is used; later lessons cannot skip an incomplete predecessor. Step3 unlocks the next lesson immediately, independent of Step4.
- **Legacy completion:** A user's own already-Step3-completed lesson remains accessible without permitting its state to unlock unrelated predecessors/courses.
- **Idempotency/races:** Submitted round identity is used in normal lookup and P2002/P2034 recovery. Immutable retries return before mutation, and the unique attempt is created before SM-2 persistence inside the transaction.
- **Lesson statuses:** `first_passed` is guarded into `reviewing`; all-word round-5 completion is guarded into `reinforced`; `reinforced` is never overwritten by retry.
- **Reset rollback:** All destructive deletes are inside one transaction, and story-dependent rows precede vocabulary rows in FK-safe order.
- **Next 16 contracts:** Dynamic `params` are still awaited promises.
- **Privacy/content safety:** No novel body, secret, or environment value was added or printed. Story rendering still uses React text nodes; no raw HTML API was introduced.
- **Scope:** The draft-phonetic staging Minor was not changed.

## Limitations / follow-up notes

- Full-repository lint remains red at its documented pre-existing baseline of 130 problems; changed files are clean.
- No live PostgreSQL concurrency test or production database operation was run. Race behavior is covered by deterministic Prisma fakes plus Serializable transaction/P2002/P2034 handling.
- The Prisma schema was validated and the client generated, but no schema migration/database push was executed because this dispatch explicitly avoided touching a real database. The new optional attempt snapshot columns must be applied through the project's normal schema deployment flow before runtime deployment.
- Snapshotless legacy attempts can only be replayed safely while they are still the current persisted round; delayed legacy attempts reject with conflict instead of returning mutable/fabricated state.
- The Next build continues to warn that multiple lockfiles cause workspace-root inference; this is unrelated to the four fixes.

## Commit

- `d1f20f07ddcb39c774c4f4ea57e67a8cd139d926` — `fix(story): enforce final learning invariants`
