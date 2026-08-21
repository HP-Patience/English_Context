# Runtime Task 1 Report

## Next.js 16 local documentation notes (recorded before runtime edits)

Read from local `node_modules/next/dist/docs/` in this worktree. Installed versions: `next@16.2.9`, `eslint-config-next@16.2.9`, React `19.2.4`.

Version-specific constraints relevant to upcoming runtime work:

- App Router pages are file-system routed under `app/`; a route becomes publicly accessible by adding `page.tsx`, and nested folders define URL segments.
- Dynamic segments use bracket folders such as `[lessonId]`; in Next.js 16 docs, `params` provided to pages/layouts/route handlers is a Promise and should be awaited.
- Route handlers live in `app/**/route.ts`, use Web `Request`/`Response` APIs, support HTTP methods like `GET`/`POST`, and cannot coexist with a `page.tsx` at the same route segment level.
- Route handler context can be typed with `RouteContext<'/users/[id]'>` after type generation (`next dev`, `next build`, or `next typegen`).
- Route handlers are not cached by default. A `GET` handler must explicitly opt into static caching (for example `dynamic = 'force-static'`), while non-GET methods are not cached.
- With Cache Components enabled, GET route handlers follow the same prerendering model as pages; prerendering stops when accessing request properties, cookies/headers, database queries, async filesystem, network, or non-deterministic operations.

Docs read:

- `01-app/01-getting-started/03-layouts-and-pages.md`
- `01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
- `01-app/01-getting-started/15-route-handlers.md`
- `01-app/03-api-reference/03-file-conventions/route.md`
- `01-app/01-getting-started/08-caching.md`

## TDD evidence

### RED

Command:

```powershell
npm run test:runtime -- src/lib/story-progress.test.ts
```

Result: exit 1 as expected before production modules existed.

Key output:

```text
FAIL  src/lib/story-progress.test.ts [ src/lib/story-progress.test.ts ]
Error: Cannot find module './story-types' imported from F:/english_context/.worktrees/story-learning/src/lib/story-progress.test.ts
Test Files  1 failed (1)
Tests  no tests
```

### GREEN

Command:

```powershell
npm run test:runtime -- src/lib/story-progress.test.ts
```

Result: exit 0 after minimal implementation.

Key output:

```text
Test Files  1 passed (1)
Tests  7 passed (7)
```

## Implementation notes

- Added `vitest@^4.1.11`, `test:runtime`, and `vitest.config.ts` for focused runtime tests.
- Added browser-safe pure TypeScript story content types matching the offline pipeline contract in `scripts/lib/story-content.mjs`.
- Mirrored the offline validator rules in runtime code instead of importing the Node script module, keeping the runtime module independent of scripts, Prisma, filesystem, and environment state.
- Added pure story progress helpers for first-pass Step1-Step3 sequencing and non-blocking Step4 access.

## Validation evidence

Commands run after implementation:

```powershell
npm run test:runtime -- src/lib/story-progress.test.ts
npx tsc --noEmit
npm run lint -- src/lib/story-types.ts src/lib/story-progress.ts src/lib/story-progress.test.ts vitest.config.ts
npm run test:story -- scripts/test/story-content.test.mjs
git diff --check
```

Results:

- Focused Vitest runtime test: exit 0, 1 file passed, 7 tests passed.
- TypeScript: exit 0.
- ESLint on changed runtime/config/test files: exit 0.
- Existing offline story content validator tests: exit 0, 3 tests passed.
- `git diff --check`: exit 0.

## Self-review

- Confirmed no `.env`, `.env.local`, or raw novel files were touched.
- Confirmed no Prisma, API route, or UI files were implemented for later tasks.
- Confirmed runtime modules are pure and do not import Prisma, Node filesystem APIs, browser state, or the script-side validator.
- Confirmed `StoryLessonDocument` field names and validation constraints mirror the offline validated persisted JSON (`title`, `order`, source fields, `paragraphs[].sceneTitle`, `segments` with `text`/`targetWord`, unique positive `wordOrder`, max 100 target words).

## Concerns

- `npm install` reported existing audit findings (1 moderate, 5 high). I did not run `npm audit fix` because that would change unrelated dependencies.
