# Runtime Task 6 Report

**Date:** 2026-08-21
**Worktree:** `F:\english_context\.worktrees\story-learning`
**Branch:** `feature/story-learning`
**Base SHA:** `515c62ac5c2fe54b16fb71699ce7c7294611c5c8`
**Implementation commit message:** `feat: add story Step1 through Step3 learning flow`

## Scope completed

Implemented the complete first-pass lesson route and Step1–Step3 experience for `/story/[lessonId]`.

- Added a Next.js 16 dynamic Server Component that awaits Promise-based route params, calls `connection()`, normalizes the lesson identifier, and uses `notFound()` for malformed or unavailable lesson IDs.
- Loaded lesson and continuation data only through `getStoryLesson` and `listStoryLessons`, preserving the existing unique-ready-course publication boundary.
- Reduced the Server-to-Client lesson payload to public lesson metadata, structured paragraphs, and lesson words. Generator-only `sourceSummary` and `continuityNotes` are not passed to the Client Component.
- Added a client lesson shell that owns the current first-pass view and persists Step 1, Step 2, and Step 3 sequentially through `POST /api/story/lessons/[id]/progress`.
- Locked Step 2 until Step 1 is persisted and Step 3 until Step 2 is persisted. Completed steps remain revisitable without reposting progress.
- Added immediate next-lesson/course navigation after Step 3 and a separate due Step 4 anchor. Step 4 is explicitly non-blocking.
- Added structured story rendering without `dangerouslySetInnerHTML`.
- Added Step 1 English targets with Chinese context glosses.
- Added Step 2 recall with English retained, glosses hidden by default, explicit reveal controls, and local `记得 / 模糊 / 忘记` self-ratings instead of 60–100 forced text inputs.
- Exported `RecallGlossControl` as a dedicated reveal boundary so Runtime Task 7 can replace or reuse the behavior without rewriting the recall flow.
- Added Step 3's complete ordered lesson word ledger, grouped by story scene, with query and scene filtering.
- Rendered each word's order, English text, phonetic slot, part of speech, meaning, context gloss, story usage, and example when available.

## Files

Created:

- `src/app/story/[lessonId]/page.tsx`
- `src/app/story/[lessonId]/page.test.tsx`
- `src/components/story/StoryLessonShell.tsx`
- `src/components/story/StoryLessonShell.test.tsx`
- `src/components/story/StoryStepNav.tsx`
- `src/components/story/StoryReader.tsx`
- `src/components/story/StoryRecall.tsx`
- `src/components/story/StoryWordList.tsx`
- `src/components/story/StoryWordDetail.tsx`

Documentation:

- `.superpowers/sdd/2026-08-21-story-learning-runtime/task-6-report.md`

## Next.js 16 constraints applied

The local documentation under `node_modules/next/dist/docs/` was treated as authoritative for this repository's Next.js version.

- Dynamic page `params` are typed as `Promise<{ lessonId: string }>` and awaited before use.
- `notFound()` is used as the safe route boundary for malformed, missing, draft, unpublished, or otherwise unavailable lessons.
- `await connection()` declares request-time rendering before local-user and Prisma-backed service access.
- The production build classifies both `/story` and `/story/[lessonId]` as dynamic routes.

## Strict TDD evidence

RTL tests were written before the corresponding production components and route.

### RED 1 — lesson route and components absent

Command:

```text
npm run test:runtime -- src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
```

Observed result before implementation:

- 2 failed test suites.
- Imports failed because `StoryLessonShell`, `StoryWordList`, and `src/app/story/[lessonId]/page.tsx` did not exist.
- The tests already specified structured Step 1 rendering, hidden Step 2 glosses, sequential persistence, complete scene-grouped Step 3 content, safe server loading, and non-blocking Step 4 behavior.

### GREEN 1 — initial first-pass flow

After the smallest implementation satisfying those contracts, the focused suite passed with 2 files and 9 tests.

### RED 2 — completed-step revisit regression

A focused regression was added requiring a reader who revisits completed Step 1 to return to the next unlocked step without reposting completion.

Observed result:

- The new assertion failed because the completed-step action had no explicit return behavior.

The shell was then changed to render `返回第二步` or `返回第三步` as appropriate and switch views locally without calling the progress endpoint.

### Final focused GREEN

```text
npm run test:runtime -- src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
Test Files  2 passed (2)
Tests       10 passed (10)
```

## Behavior and data-boundary review

### Server route

- Normalizes the requested lesson ID before data access.
- Resolves the local user and requested lesson through the existing story service.
- Relies on the service's unique ready-course lookup, so draft, failed, archived, and unpublished course material is not made addressable by this page.
- Resolves the next ready lesson by ascending lesson order.
- Does not load the source novel file or query generator drafts.
- Does not expose raw novel bodies, `sourceSummary`, or `continuityNotes` to the browser.

### Sequential progress

- The navigation's unlocked range is derived from persisted `completedStep`.
- Completion requests send exactly `{ step: 1 | 2 | 3 }` to the lesson progress endpoint.
- A failed response leaves the reader on the current step and exposes an accessible alert.
- Step 3 completion immediately replaces the completion control with the next-lesson/course action and due Step 4 link.
- Step 4 remains a later reinforcement section and is never required to continue the course.

### Structured rendering and safety

- Generated lesson segments are mapped as React text nodes and reusable target-word nodes.
- No generated HTML is interpreted and no `dangerouslySetInnerHTML` path was added.
- Only validated structured lesson paragraphs supplied by the ready-course service are rendered.

## Readability, responsive design, and accessibility

The implementation continues the established ancient-chronicle visual language:

- stone and ink surfaces;
- cinnabar-red target accents and chapter seal;
- amber reinforcement accents;
- serif chronicle headings;
- vertical scene timeline;
- dark ledger-style step navigation;
- restrained rounded scroll/card surfaces rather than a generic dashboard treatment.

For 60–100-word lessons:

- story text is separated into named scene sections with generous line height;
- Step 2 focuses recall on one word at a time while retaining the full English story above it;
- Step 3 groups the complete ledger by scene and uses two columns at desktop widths and one column on smaller screens;
- a 100-word RTL fixture verifies all 100 word cards remain rendered in four scene regions.

Accessibility and mobile details include semantic headings and regions, a named navigation landmark, disabled locked steps, `aria-current="step"`, `aria-expanded` reveal state, live status/alert feedback, touch-sized controls, visible focus rings, responsive stacking, and dark-mode contrast classes.

A temporary fixture-only preview was checked at desktop width and at 390px mobile width. Step 1 rendered correctly, and a mocked progress response advanced the mobile flow to Step 2. The preview route and exact development-server process were removed before final validation.

## Final validation

```text
npm run test:runtime -- src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
Test Files  2 passed (2)
Tests       10 passed (10)

npm run test:runtime -- src
Test Files  9 passed (9)
Tests       69 passed (69)

npm run test:story
54 passed / 0 failed

npx tsc --noEmit
exit 0

npx eslint src/app/story/[lessonId]/page.tsx src/app/story/[lessonId]/page.test.tsx src/components/story/StoryLessonShell.tsx src/components/story/StoryLessonShell.test.tsx src/components/story/StoryStepNav.tsx src/components/story/StoryReader.tsx src/components/story/StoryRecall.tsx src/components/story/StoryWordList.tsx src/components/story/StoryWordDetail.tsx
exit 0

npm run build
Next.js 16.2.9 production build passed
/story              ƒ Dynamic
/story/[lessonId]   ƒ Dynamic
```

The first TypeScript rerun after deleting the temporary preview source detected stale generated references under `.next/dev/types`. The stale generated directory was removed after verifying its absolute path was inside this worktree; TypeScript then passed. No source code was changed to hide that failure.

The production build emitted only the known pre-existing multiple-lockfile workspace-root warning. It selected `F:\english_context\package-lock.json` and also detected the worktree lockfile.

## Phonetic data limitation

The current Prisma and story API contracts do not contain a phonetic field:

- `Word` currently exposes `id`, `text`, and `language`.
- `StoryLessonWordDto.word` currently exposes only `id` and `text`.

`StoryWordDetail` supports optional top-level or word-level phonetic data so the UI can display it as soon as a later contract supplies it. For current production rows, it renders the explicit accessible fallback `音标暂无` rather than fabricating pronunciation data. Expanding and populating the vocabulary data model is outside Task 6's listed files and should be handled as a separate data-contract task.

## Final diff review

- Only the nine Task 6 implementation/test files and this report are intended for commit.
- No temporary preview route remains.
- No dependency, schema, migration, environment, generated Next.js output, or unrelated application file is included.
- No raw novel text or generator draft was added.
- No `dangerouslySetInnerHTML` implementation was added.
- `git diff --check` passes.
