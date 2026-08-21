# Gu Zhen Ren Story Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resumable offline pipeline that parses the GB18030 novel source, creates a continuity-aware 61–150 lesson outline, assigns all 6098 vocabulary words, validates generated lesson JSON, and persists ready lessons for the story-learning UI.

**Architecture:** Keep novel processing offline and separate from request-time Next.js code. The pipeline reads `蛊真人.txt`, emits chapter/outline artifacts into an ignored cache directory, calls the configured LLM through an injectable adapter, validates structured lesson content, and writes only validated `StoryLesson` and `StoryLessonWord` records to PostgreSQL through Prisma.

**Tech Stack:** Node.js 20+, ESM `.mjs` scripts, native `TextDecoder('gb18030')`, Prisma 5.22, PostgreSQL/Neon, OpenAI-compatible chat completions, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-21-gu-zhen-ren-story-vocab-design.md`

## Global Constraints

- Use `F:\english_context\蛊真人.txt` as the source and decode it as GB18030.
- Generate a continuous retelling of the complete novel main line; do not map one source chapter to one lesson.
- Target 80–100 lessons, allow 50–150, and never exceed 150; full 6098-word coverage requires at least 61 lessons.
- Each lesson contains at most 100 target words, normally 60–80.
- Prefer existing `WordGroup` order for word assignment, but never damage story continuity to force a word.
- Do not load the full novel into the browser, commit it to Git, or store the full raw novel in the database.
- Story generation is offline, resumable, validated JSON; request-time pages do not call the LLM to create lessons.
- A failed or invalid lesson is not visible to users until its status is `ready`.

---

### Task 1: Add the story content contract and failing validator tests

**Files:**
- Create: `scripts/lib/story-content.mjs`
- Create: `scripts/test/story-content.test.mjs`
- Modify: `package.json` (`test:story` script)

**Interfaces:**
- Produces `parseLessonDocument(value) -> StoryLessonDocument`.
- Produces `validateLessonDocument(value, context) -> { ok: true, value } | { ok: false, errors }`.
- `StoryLessonDocument` has `title`, `order`, `sourceChapterStart`, `sourceChapterEnd`, `sourceSummary`, `continuityNotes`, and `paragraphs`.
- Each paragraph has `sceneTitle` and `segments`; each segment is either `{ type: 'text', value: string }` or `{ type: 'targetWord', word: string, definitionCn: string, wordOrder: number }`.

- [ ] **Step 1: Write the failing tests**

Create a fixture with two scenes and three target words, then test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLessonDocument } from '../lib/story-content.mjs'

const valid = {
  title: 'Story 01：青茅山的重生',
  order: 1,
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第三章',
  sourceSummary: '方源在青茅山醒来并确认重生。',
  continuityNotes: '下一篇进入资质检测。',
  paragraphs: [{
    sceneTitle: '醒来',
    segments: [
      { type: 'text', value: '他回到了 ' },
      { type: 'targetWord', word: 'dorm', definitionCn: '宿舍', wordOrder: 1 },
      { type: 'text', value: '。' },
    ],
  }],
}

test('accepts a valid lesson document', () => {
  const result = validateLessonDocument(valid, { maxTargetWords: 100 })
  assert.equal(result.ok, true)
})

test('rejects a lesson with more than 100 target words', () => {
  const tooLarge = structuredClone(valid)
  tooLarge.paragraphs[0].segments = Array.from({ length: 101 }, (_, index) => ({
    type: 'targetWord', word: `word-${index}`, definitionCn: '释义', wordOrder: index + 1,
  }))
  const result = validateLessonDocument(tooLarge, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /100/)
})

test('rejects duplicate target-word order and empty glosses', () => {
  const invalid = structuredClone(valid)
  invalid.paragraphs[0].segments.push({
    type: 'targetWord', word: 'dorm', definitionCn: '', wordOrder: 1,
  })
  const result = validateLessonDocument(invalid, { maxTargetWords: 100 })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /wordOrder|definitionCn/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test:story -- scripts/test/story-content.test.mjs`

Expected: FAIL because `scripts/lib/story-content.mjs` does not export the validator yet.

- [ ] **Step 3: Add the minimal contract implementation**

Implement strict checks for required strings, positive integer `order`, non-empty paragraphs, segment discriminators, unique `wordOrder` values, non-empty `definitionCn`, and `maxTargetWords`. Return all validation errors in one result so the batch validator can report a complete lesson failure.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm run test:story -- scripts/test/story-content.test.mjs`

Expected: PASS with three tests and zero failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/story-content.mjs scripts/test/story-content.test.mjs package.json
git commit -m "test: define story lesson content contract"
```

---

### Task 2: Add Prisma models for lessons and progress

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/test/schema-contract.test.mjs`

**Interfaces:**
- `StoryLesson` is the persisted lesson document and has `status` values `draft`, `ready`, or `failed`.
- `StoryLessonWord` links one lesson to one existing `Word` and one selected `Meaning`.
- `UserStoryProgress` tracks lesson-level Step1–Step4 state.
- `UserStoryWordProgress` tracks each word's completed review round and due date.
- `StoryReviewAttempt` logs one result for one user, lesson word, and round.

- [ ] **Step 1: Write the failing schema contract test**

Create a script that reads `prisma/schema.prisma` and asserts the four model names and the required fields exist. The test must fail before the schema edit.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:story -- scripts/test/schema-contract.test.mjs`

Expected: FAIL because the new model declarations are absent.

- [ ] **Step 3: Add the models and indexes**

Add relations to `WordGroup`, `Word`, `Meaning`, and `User`, with these required unique constraints:

```prisma
@@unique([userId, lessonId])
@@unique([userId, lessonWordId])
@@unique([userId, lessonWordId, round])
```

Add indexes for `StoryLesson.order`, `StoryLesson.status`, and `UserStoryWordProgress.nextReviewAt`. Store the generated lesson as `contentJson String` to remain compatible with the existing schema style.

- [ ] **Step 4: Run Prisma validation and the schema contract test**

Run: `npx prisma validate`

Expected: exit code 0.

Run: `npm run test:story -- scripts/test/schema-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Apply the development schema**

Run: `npm run db:push`

Expected: Prisma reports the new tables are synchronized without deleting existing Word, Meaning, UserWord, or review data.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma scripts/test/schema-contract.test.mjs
git commit -m "feat: add story lesson and review models"
```

---

### Task 3: Implement the GB18030 novel parser

**Files:**
- Create: `scripts/lib/novel-parser.mjs`
- Create: `scripts/test/novel-parser.test.mjs`
- Create: `scripts/test/fixtures/novel-sample-gb18030.bin`
- Create: `scripts/parse-novel.mjs`
- Modify: `package.json` (`story:parse` script)
- Modify: `.gitignore` (ignore the raw novel and generated story cache)

**Interfaces:**
- `decodeNovelBuffer(buffer) -> string`.
- `parseChapters(text) -> Array<{ order, title, text, startOffset, endOffset }>`.
- `cleanNovelText(text) -> string`.
- `writeNovelIndex({ sourcePath, outputPath }) -> Promise<{ chapterCount, outputPath }>`.

- [ ] **Step 1: Write the failing parser tests**

Test GB18030 decoding with a committed binary fixture containing `蛊真人`, two chapter headers, and a removable download-site footer. Test that chapter order is monotonic and footer text is absent from chapter bodies.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { decodeNovelBuffer, cleanNovelText, parseChapters } from '../lib/novel-parser.mjs'

test('decodes GB18030 Chinese text', async () => {
  const bytes = await readFile(new URL('./fixtures/novel-sample-gb18030.bin', import.meta.url))
  assert.match(decodeNovelBuffer(bytes), /蛊真人/)
})

test('parses ordered chapters and removes source boilerplate', () => {
  const chapters = parseChapters(cleanNovelText('第一章\n甲\n第二章\n乙\n爱下电子书'))
  assert.deepEqual(chapters.map(chapter => chapter.order), [1, 2])
  assert.equal(chapters.some(chapter => chapter.text.includes('爱下电子书')), false)
})
```

- [ ] **Step 2: Run the focused parser test and verify it fails**

Run: `npm run test:story -- scripts/test/novel-parser.test.mjs`

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement decoding, cleanup, and chapter parsing**

Use `new TextDecoder('gb18030')` for bytes. Normalize CRLF, remove known header/footer markers and download-site lines, then detect Chinese chapter headings without assuming one fixed title format. Preserve source offsets so a generated lesson can cite a chapter range.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test:story -- scripts/test/novel-parser.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add the real-file command and ignore rules**

`node scripts/parse-novel.mjs` must read `F:\english_context\蛊真人.txt`, write `scripts/.story-cache/novel-index.json`, print chapter count and byte/character counts, and exit nonzero when the source file is missing or contains replacement-character density above the configured threshold.

Add these ignore rules without staging the novel itself:

```gitignore
/蛊真人.txt
/scripts/.story-cache/
```

- [ ] **Step 6: Run the real-file smoke test**

Run: `npm run story:parse`

Expected: exit code 0, a non-empty chapter index, and no console output containing replacement characters `�`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/novel-parser.mjs scripts/test/novel-parser.test.mjs scripts/test/fixtures/novel-sample-gb18030.bin scripts/parse-novel.mjs package.json .gitignore
git commit -m "feat: parse Gu Zhen Ren source into chapter index"
```

---

### Task 4: Build the continuity outline with resumable checkpoints

**Files:**
- Create: `scripts/lib/llm-json.mjs`
- Create: `scripts/lib/story-outline.mjs`
- Create: `scripts/test/story-outline.test.mjs`
- Create: `scripts/build-story-outline.mjs`
- Modify: `package.json` (`story:outline` script)

**Interfaces:**
- `createLlmJsonClient({ apiKey, baseURL, model, client }) -> { generateJson(prompt, schemaName) }`.
- `buildChapterSummaries({ chapters, generateJson, checkpointPath }) -> Promise<ChapterSummary[]>`.
- `buildStoryOutline({ chapterSummaries, vocabularyCount, generateJson, checkpointPath }) -> Promise<StoryOutline>`.
- `StoryOutline` contains `lessons`, each with `order`, `sourceChapterStart`, `sourceChapterEnd`, `plotSummary`, `characters`, `events`, `continuityStart`, `continuityEnd`, and `targetWordCapacity`.

- [ ] **Step 1: Write the failing tests with a fake JSON client**

Test that chapter batches are requested in order, completed batches are loaded from a checkpoint, and the final outline stays within 61–150 lessons with each lesson capacity at most 100.

```js
const fakeClient = {
  calls: [],
  async generateJson(prompt) {
    this.calls.push(prompt)
    return { summary: '测试摘要', characters: ['方源'], events: ['重生'] }
  },
}
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test:story -- scripts/test/story-outline.test.mjs`

Expected: FAIL because the outline modules are not implemented.

- [ ] **Step 3: Implement the checkpointed outline builder**

Use JSON checkpoint files under `scripts/.story-cache/outline/`. Write after every successful chapter batch and after the final lesson outline. Never delete a valid checkpoint before the replacement is fully written; use a temporary file plus rename.

The outline prompt must require chronological ordering, explicit source chapter ranges, a continuity handoff, and a `targetWordCapacity` between 40 and 100. The builder must reject an outline outside 61–150 lessons or with overlapping/backward chapter ranges.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test:story -- scripts/test/story-outline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add the real-file command**

`node scripts/build-story-outline.mjs` must read `scripts/.story-cache/novel-index.json`, use the configured `.env`/`.env.local` LLM settings, resume from checkpoints, and write `scripts/.story-cache/story-outline.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/llm-json.mjs scripts/lib/story-outline.mjs scripts/test/story-outline.test.mjs scripts/build-story-outline.mjs package.json
git commit -m "feat: build resumable novel story outline"
```

---

### Task 5: Generate, validate, and persist lesson documents

**Files:**
- Create: `scripts/lib/story-lesson-generator.mjs`
- Create: `scripts/lib/story-lesson-repository.mjs`
- Create: `scripts/test/story-lesson-generator.test.mjs`
- Create: `scripts/test/story-lesson-repository.test.mjs`
- Create: `scripts/generate-story-lessons.mjs`
- Create: `scripts/validate-story-lessons.mjs`
- Modify: `package.json` (`story:generate`, `story:validate` scripts)

**Interfaces:**
- `assignWordsToOutline({ wordGroups, outline, maxWordsPerLesson: 100 }) -> { assignments, unassignedWords }`.
- `generateLesson({ outlineLesson, words, previousLesson, nextLesson, generateJson }) -> StoryLessonDocument`.
- `validateCorpus({ lessons, allWordTexts, minLessons: 61, maxLessons: 150, maxWordsPerLesson: 100 }) -> ValidationReport`.
- `persistReadyLesson({ prisma, lessonDocument, wordMap, meaningMap }) -> Promise<{ lessonId, createdWordCount }>`.

- [ ] **Step 1: Write failing assignment and generation tests**

Cover these cases:

- 205 words are split into three assignments with no assignment over 100.
- WordGroup order is preserved when the story outline has capacity.
- A repeated word in story segments maps to one `StoryLessonWord`.
- A generated lesson missing a requested word is rejected.
- A valid lesson is persisted idempotently when the command is run twice.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test:story -- scripts/test/story-lesson-generator.test.mjs scripts/test/story-lesson-repository.test.mjs`

Expected: FAIL because assignment, generation, and repository modules are not implemented.

- [ ] **Step 3: Implement deterministic assignment and generation validation**

Assign each `Word.text` exactly once as a primary target. Use `WordGroup.sortOrder` and `WordGroupItem.sortOrder` as the initial queue, then permit only local reordering when a word cannot fit the current plot. Store a report explaining skipped/reordered words.

The lesson prompt must request the exact JSON shape from Task 1 and must include:

```text
- source chapter range
- previous lesson continuity end
- current plot summary
- next lesson continuity start
- the complete target-word list
- one contextual Chinese gloss for every target word
- no target word omitted
```

After generation, validate the document and compare the set of target words against the assignment before any database write.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test:story -- scripts/test/story-lesson-generator.test.mjs scripts/test/story-lesson-repository.test.mjs`

Expected: PASS.

- [ ] **Step 5: Implement idempotent Prisma persistence**

Create or update `StoryLesson` by stable `order`, mark it `draft` before processing, replace its child `StoryLessonWord` records inside a transaction, and mark it `ready` only after all referenced `Word` and `Meaning` records resolve. On failure, store `status = 'failed'` and a bounded `generationError`.

- [ ] **Step 6: Implement the batch command and corpus validator**

`npm run story:generate` must:

1. Load the novel index and outline.
2. Load ordered WordGroup words and selected meanings from Prisma.
3. Resume from the first non-ready lesson.
4. Generate lessons with bounded concurrency of 1 by default.
5. Persist each lesson transactionally.
6. Write `scripts/.story-cache/story-generation-report.json`.

`npm run story:validate` must verify lesson count, word count cap, all 6098 words assigned, monotonic source ranges, no invalid statuses, and no duplicate `(lessonId, wordId)` links.

- [ ] **Step 7: Run a small end-to-end pipeline fixture**

Use a temporary database fixture with 205 words and a fake LLM adapter. Run parse, outline, generation, and validation commands. Expected: three ready lessons, all 205 words assigned once, each lesson at most 100 words, and a zero-error validation report.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/story-lesson-generator.mjs scripts/lib/story-lesson-repository.mjs scripts/test/story-lesson-generator.test.mjs scripts/test/story-lesson-repository.test.mjs scripts/generate-story-lessons.mjs scripts/validate-story-lessons.mjs package.json
git commit -m "feat: generate and persist story vocabulary lessons"
```

---

### Task 6: Verify the complete offline pipeline before handing off to the runtime plan

**Files:**
- Modify: `README.md`
- Create: `scripts/test/story-pipeline-smoke.mjs`

**Interfaces:**
- Documents the commands `npm run story:parse`, `npm run story:outline`, `npm run story:generate`, and `npm run story:validate`.
- Documents that `蛊真人.txt` is local-only and must not be committed.

- [ ] **Step 1: Write the failing smoke test**

The smoke test must assert that the parser output, outline output, and lesson validation report exist and contain the expected JSON keys after a fixture run.

- [ ] **Step 2: Run it before fixture generation**

Run: `npm run test:story -- scripts/test/story-pipeline-smoke.mjs`

Expected: FAIL because the cache artifacts do not yet exist.

- [ ] **Step 3: Add the fixture runner and README instructions**

Make the test create and remove its own temporary cache directory so it never depends on the 12.7 MB novel or a production database. Add a README section explaining local generation order and the required environment variables without exposing any values.

- [ ] **Step 4: Run all story tests and the real parser validation**

Run: `npm run test:story`

Expected: PASS with zero failures.

Run: `npm run story:parse`

Expected: exit code 0 and a non-empty chapter index.

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/test/story-pipeline-smoke.mjs
git commit -m "docs: document story lesson generation pipeline"
```
