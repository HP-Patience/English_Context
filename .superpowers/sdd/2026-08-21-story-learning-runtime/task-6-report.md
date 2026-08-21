# Runtime Task 6 Report

**Date:** 2026-08-21
**Worktree:** `F:\english_context\.worktrees\story-learning`
**Branch:** `feature/story-learning`
**Base SHA:** `515c62ac5c2fe54b16fb71699ce7c7294611c5c8`
**Original Task 6 commit:** `d7965e09ef217a93a3429ac270756fbc02c16ea8` (`feat: add story Step1 through Step3 learning flow`)
**Review-fix commit message:** `fix: address story lesson review findings`

## Delivered scope

Implemented `/story/[lessonId]` and the sequential Step1–Step3 first-pass learning flow in the current ancient-chronicle visual language.

- The Next.js 16 Server Component awaits Promise-based dynamic params, calls `connection()`, normalizes the lesson ID, loads only through ready-course services, and uses `notFound()` for malformed or unavailable lessons.
- The client shell persists Step 1, Step 2, and Step 3 through the progress API. Step 2 cannot open before persisted Step 1, and Step 3 cannot open before persisted Step 2.
- A failed progress request leaves the reader on the current step and announces the failure through an alert.
- Step 3 completion immediately offers the next lesson and the due Step 4 reinforcement link. Step 4 never blocks course continuation.
- Step 1 renders structured English target segments with Chinese context glosses.
- Step 2 keeps English visible, hides glosses by default, and provides one-word-at-a-time recall ratings rather than forcing 60–100 text inputs.
- Step 3 renders the complete ordered word ledger grouped by scene, with query and scene filtering, responsive one/two-column layouts, phonetic/POS/meaning/story usage/example details, and a 100-word readability fixture.
- Story text is rendered as React text/target nodes without interpreting generated HTML.

## Review fixes

### 1. Persisted phonetics end to end

The existing source and importer were inspected before changing the data model.

- The only vocabulary source is `data/2026考研英语词汇闪过.txt`.
- It contains section headings and bare word rows only; it has no phonetic column or other pronunciation source.
- A non-destructive parser scan found 118 sections, 6,100 occurrences, 6,098 unique words, and 0 populated phonetics.
- No phonetics were fabricated.

Implemented the real nullable path:

- Added nullable `Word.phonetic` to `prisma/schema.prisma`.
- Added `scripts/lib/word-import.js` as the reusable import parser/validator.
- Preserved the current bare-word format as `{ phonetic: null }`.
- Added optional, unambiguous `word<TAB>phonetic` input support. Explicit supplied values are trimmed and persisted exactly; blank optional values become `null`.
- Duplicate rows retain a supplied phonetic when another occurrence is missing it, while conflicting non-null phonetics fail validation rather than being guessed.
- Updated `scripts/import-new.js` to create `Word` rows with the parsed nullable phonetic and to continue building word groups from structured rows.
- Added `phonetic: string | null` to the runtime story word DTO and service mapper.
- Updated Step 3 to render the persisted value when present and `音标暂无` only for legacy/missing null rows.

Coverage includes schema, import parser/validator, deduplication/conflict handling, service DTO mapping, and UI rendering of one real value plus one null fallback.

### 2. Public lesson detail DTO

Added `PublicStoryLessonContent` and `PublicStoryLessonDetail` plus the explicit `toPublicStoryLessonDetail` mapper.

- `GET /api/story/lessons/[id]` now serializes only public lesson content.
- Public content includes title, order, source chapter range, and structured paragraphs.
- Generator-only `sourceSummary` and `continuityNotes` are omitted.
- The server page reuses the same mapper before crossing the Server-to-Client component boundary.
- Route contract tests prove both fields are absent.
- The page test captures `StoryLessonShell` props and proves generator metadata is absent there as well.

### 3. Step 3 story-usage search

`StoryWordList` now includes `storyUsage` in normalized search text. An RTL test uses a phrase present only in the usage sentence and verifies that the correct word remains visible while the other word is filtered out.

### 4. Reveal before self-rating

`RecallGlossControl` is now a controlled reveal boundary. Reveal state is owned by `StoryRecall`, allowing Task 7 to reuse or replace the control without coupling rating behavior to private child state.

- All three self-rating buttons are disabled before the active word's gloss is revealed.
- Revealing the gloss enables the ratings.
- Moving to another word clears reveal state.
- Returning to a previously viewed word also requires a fresh reveal.

### 5. Regression and safety coverage

- Added a realistic rejected progress response test proving the current step remains active, the next step remains locked, and an alert is shown.
- Replaced the meaningless DOM selector for a non-existent `dangerouslySetInnerHTML` attribute.
- The replacement fixture supplies text resembling an injected `<img onerror>` element and proves it appears as literal text while no image element is created.
- Added captured page-shell prop assertions for the public DTO boundary.

## Strict TDD evidence for review fixes

Tests were changed before production code and run in focused suites.

### RED — schema/import

```text
npm run test:story -- scripts/test/schema-contract.test.mjs scripts/test/word-import.test.mjs
```

Observed:

- `Word.phonetic` schema contract failed because the field did not exist.
- The import parser suite failed because `scripts/lib/word-import.js` did not exist.

### RED — runtime/API/UI

```text
npm run test:runtime -- src/lib/story-service.test.ts src/lib/story-api-types.test.ts src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
```

Observed five failing tests:

- service DTO omitted the populated phonetic;
- public detail API leaked generator metadata;
- ratings were enabled before reveal;
- Step 3 search ignored usage-only text;
- page shell content did not use the complete public content DTO shape.

The failed-progress and literal-markup safety tests passed immediately as characterization coverage of behavior that was already implemented correctly.

A subsequent RED regression proved that merely keying reveal state by word was insufficient: returning to the first word restored its old reveal. Navigation was then changed to clear reveal state explicitly.

### Focused GREEN

```text
npm run test:story -- scripts/test/schema-contract.test.mjs scripts/test/word-import.test.mjs
12 passed / 0 failed

npm run test:runtime -- src/lib/story-service.test.ts src/lib/story-api-types.test.ts src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
Test Files  4 passed (4)
Tests       40 passed (40)
```

## Next.js 16 constraints

Local documentation under `node_modules/next/dist/docs/` was treated as authoritative.

- Dynamic page and route-handler params are Promises and are awaited before use.
- The page declares request-time rendering with `await connection()`.
- `notFound()` remains the safe page boundary.
- The detail route uses the current Web/Next response contract and remains dynamic.
- The production build reports `/story`, `/story/[lessonId]`, and story API routes as dynamic.

## Accessibility, safety, and responsive behavior

- Semantic headings, scene regions, navigation labels, live status, and alert feedback are retained.
- Locked steps and pre-reveal ratings use native disabled controls.
- Reveal controls expose `aria-expanded` and descriptive accessible names.
- Controls remain touch-sized with visible focus states and dark-mode contrast.
- Step 3 remains one column on small screens and two columns at desktop widths.
- A 100-word fixture verifies all cards render in stable order across four scene groups.
- Structured segments are rendered as React text nodes; no raw novel body, generator draft, or interpreted HTML is exposed.

## Final validation

```text
# Focused story contracts
npm run test:story -- scripts/test/schema-contract.test.mjs scripts/test/word-import.test.mjs
12 passed / 0 failed

# Focused runtime/API/page/UI
npm run test:runtime -- src/lib/story-service.test.ts src/lib/story-api-types.test.ts src/components/story/StoryLessonShell.test.tsx src/app/story/[lessonId]/page.test.tsx
Test Files  4 passed (4)
Tests       40 passed (40)

# Full runtime
npm run test:runtime -- src
Test Files  9 passed (9)
Tests       71 passed (71)

# Full story/data pipeline
npm run test:story
59 passed / 0 failed

# Prisma, with placeholder DATABASE_URL
npx prisma validate
schema valid

npx prisma generate
Prisma Client v5.22.0 generated

# Static checks
npx tsc --noEmit
exit 0

npx eslint <all changed JS/MJS/TS/TSX files>
exit 0

# Production build, with placeholder DATABASE_URL
npm run build
Next.js 16.2.9 build passed
/story              ƒ Dynamic
/story/[lessonId]   ƒ Dynamic

git diff --check
exit 0
```

The build emitted only the known multiple-lockfile workspace-root warning. No generated Prisma client or `.next` output is staged.

## Final diff review

The review fix is limited to:

- nullable phonetic schema and existing vocabulary import pipeline;
- story runtime DTO/service mapping;
- public detail API/page serialization boundary;
- Step 2 reveal/rating behavior;
- Step 3 search and phonetic rendering;
- focused contracts/regressions; and
- this report.

No raw novel text, generated lesson drafts, fabricated phonetics, dependency changes, or unrelated application work were added.
