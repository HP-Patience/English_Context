# Task 6 Report: Offline story pipeline smoke and operator docs

## Status

Commit: c8715bfb31e7c2caa52aff279d93f28d8222c796

Implemented with one validation concern: the focused smoke test, full story suite, real parser run, and relevant-file lint pass. The repository-wide `npm run lint` command still fails on pre-existing unrelated lint violations outside this task's files.

## Changes

- Added `scripts/test/story-pipeline-smoke.mjs`.
  - Creates and deletes its own temporary cache/source directory.
  - Generates a synthetic GB18030 fixture source instead of reading `F:\english_context\蛊真人.txt`.
  - Uses fake LLM callbacks and an in-memory/fake persistence shape instead of production DB, credentials, or real LLM calls.
  - Verifies parse -> outline -> generation -> validation.
  - Asserts parser output, outline output, and validation report artifacts exist and contain expected JSON keys.
  - Verifies 205 words split into 3 ready lessons with max 100 target words per lesson and exact 205-word coverage.
- Updated `README.md` with operator documentation for the offline story lesson generation pipeline.
  - Documents local raw file location and that `蛊真人.txt` must not be committed.
  - Documents ignored `scripts/.story-cache/` cache/checkpoint output.
  - Lists environment variable names only, with no values.
  - Documents `npm run story:parse`, `npm run story:outline`, `npm run story:generate`, and `npm run story:validate` order.
  - Explains resumability and that real generation is offline/operator-run only.

## TDD Evidence

- Initial failing smoke test run before fixture runner implementation:
  - `npm run test:story -- scripts/test/story-pipeline-smoke.mjs`
  - Result: failed because expected cache artifacts did not exist.
- Final focused smoke test:
  - `npm run test:story -- scripts/test/story-pipeline-smoke.mjs`
  - Result: passed, 1/1.

## Verification

- `npm run test:story` — passed, 39/39.
- `npm run story:parse` — passed, parsed 1915 chapters and wrote a non-empty index to `scripts/.story-cache/novel-index.json`.
- `npx eslint scripts/test/story-pipeline-smoke.mjs` — passed.
- `git diff --check` — passed; only Git's line-ending warning for README was reported.

## Concern

- `npm run lint` fails on existing unrelated project lint violations (CommonJS requires in legacy scripts, `any` types and React lint errors in app files, etc.). The new smoke test file passes targeted ESLint.



---

# Final Fix: Versioned story-course publication and pipeline hardening

- **Date:** 2026-08-21
- **Scope:** All final-review findings in `final-review-findings.md` and `final-review-c8715bfb.md`
- **Status:** Implemented and verified; this report is included in the final-fix commit.

## Architecture and publication invariant

- Added versioned `StoryCourse` records with `draft`, `ready`, `archived`, and `failed` lifecycle states plus source, summary, outline, and assignment fingerprints.
- Moved lesson identity into a course version: `StoryLesson.courseId` is required and lesson order is unique by `(courseId, order)` rather than globally.
- Generation creates or resumes only a fingerprint-matching draft course. Every lesson write rechecks draft mutability inside a Serializable transaction before the lesson upsert, so a concurrent publication cannot leave a partially mutated published version.
- Final validation loads the complete draft course, lessons, lesson-word rows, words, and meanings inside one Serializable Prisma transaction. It validates the whole corpus before changing publication state.
- Successful validation archives the previous publication and assigns `readySlot = "ready"` to the draft atomically. `readySlot` is unique in PostgreSQL, and repository checks also reject multiple ready-status rows, multiple ready-slot rows, or status/slot drift.
- Failed or interrupted validation rolls back without changing the existing ready course. Published and archived courses are immutable to generation, preserving their lesson IDs, lesson-word IDs, and user progress.
- Future runtime work must resolve the single published course by `readySlot = "ready"` and query lessons through that course.

## Pipeline hardening

- Enforced exact production defaults: local source `F:\english_context\蛊真人.txt`, exactly 6098 vocabulary words, 61–150 lessons, and at most 100 words per lesson.
- Added stable SHA-256 fingerprints for raw source bytes, chapter metadata, every chapter-summary batch, the summary set, outline input, lesson assignment input, prior continuity, and course publication inputs.
- Old, malformed, or input-mismatched checkpoints are rejected or regenerated instead of being silently reused.
- Outline capacity is validated against `vocabularyCount` before its checkpoint is written.
- Outline generation, lesson generation, and final validation use exact source-index order coverage, including indexes with numbering gaps. They require exact first/last coverage with no omitted or overlapping actual source chapters.
- Parser output includes numbering-gap and repaired/non-monotonic-order diagnostics while the persisted chapter index remains metadata-only.
- Command `main(args, dependencies)` entry points are injectable and `--help` returns before filesystem, LLM, or database access.
- The OpenAI-compatible adapter now prefers Chat Completions in `auto` mode, supports explicit `chat-completions` or `responses`, and only falls back to Responses when Chat Completions is unavailable.
- README now explicitly states that raw chapter bodies are transmitted to the configured LLM endpoint and requires provider retention, copyright/licensing, privacy, endpoint, and organizational-policy review. It also documents that raw source text and secrets must not be persisted.

## Files changed

- `README.md`
- `prisma/schema.prisma`
- `scripts/build-story-outline.mjs`
- `scripts/generate-story-lessons.mjs`
- `scripts/parse-novel.mjs`
- `scripts/validate-story-lessons.mjs`
- `scripts/lib/input-fingerprint.mjs`
- `scripts/lib/llm-json.mjs`
- `scripts/lib/novel-parser.mjs`
- `scripts/lib/story-lesson-generator.mjs`
- `scripts/lib/story-lesson-repository.mjs`
- `scripts/lib/story-outline.mjs`
- `scripts/lib/story-source-coverage.mjs`
- `scripts/test/helpers/fake-story-prisma.mjs`
- `scripts/test/novel-parser.test.mjs`
- `scripts/test/schema-contract.test.mjs`
- `scripts/test/story-final-fixes.test.mjs`
- `scripts/test/story-lesson-repository.test.mjs`
- `scripts/test/story-outline.test.mjs`
- `scripts/test/story-pipeline-smoke.mjs`
- `.superpowers/sdd/2026-08-21-gu-zhen-ren-story-data-pipeline/task-6-report.md`

## TDD and regression evidence

- Red phase: focused final-fix tests initially failed because the schema lacked `StoryCourse`/course-scoped lesson uniqueness, checkpoints lacked required fingerprints, capacity and exact-index coverage were not enforced, and publication/repository orchestration did not exist.
- Green phase: implemented the versioned publication repository, fingerprint and coverage utilities, injectable commands, and command-level fake infrastructure until the focused tests and full story suite passed.
- Added regressions for:
  - stable/change-sensitive fingerprints;
  - Chat Completions-first transport selection;
  - summary, outline, lesson-assignment, and prior-continuity checkpoint binding;
  - pre-checkpoint outline capacity;
  - exact source-index coverage with numbering gaps and omitted-chapter detection;
  - ready status/slot invariant drift;
  - transactional mutability recheck before lesson upsert;
  - immutable prior publication identities and progress;
  - failed publication rollback and draft resumability;
  - command-level parse → outline → interrupted generation → failed publication → resumed generation → atomic publication orchestration.

## Final verification

- `npm run test:story` — passed **52/52**.
- `npm run test:story -- scripts/test/story-pipeline-smoke.mjs` — passed **1/1**; uses a synthetic GB18030 source, fake LLM, and in-memory Prisma-shaped repository, interrupts after partial generation, verifies failed publication rollback, resumes, publishes, and preserves old IDs/progress.
- Changed-file ESLint across **18 `.mjs` files** — passed with zero errors and zero warnings.
- `node scripts/parse-novel.mjs --help` — passed without source access.
- `node scripts/build-story-outline.mjs --help` — passed without LLM/source access.
- `node scripts/generate-story-lessons.mjs --help` — passed without LLM/database access.
- `node scripts/validate-story-lessons.mjs --help` — passed without database access.
- `npx prisma validate` with a non-secret placeholder `DATABASE_URL` — passed.
- `npx prisma generate` with a non-secret placeholder `DATABASE_URL` — passed.
- `git diff --check` — passed.
- No real LLM call, production database connection, production publication, or real-novel pipeline run was performed for this final fix. No environment value was printed or persisted.

## Concerns and follow-up

- This repository has no Prisma migration directory. The schema contract and generated client are valid, but deployment still requires the project’s normal reviewed database migration/apply process before running the new pipeline against a database.
- Serializable publication/version-allocation transactions can surface retriable serialization or unique-conflict errors under concurrent operators. The safe response is to rerun; no partially published state is committed.
- The real 6098-word corpus and full novel were intentionally not sent to an LLM or loaded into a production database during verification. Operators must complete the documented retention/copyright/privacy review before a real run.
- Runtime story pages are outside this pipeline patch and must query the unique ready course rather than global lesson order.
