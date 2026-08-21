import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_OUTPUT_PATH, DEFAULT_SOURCE_PATH } from '../parse-novel.mjs'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const scriptPath = resolve(projectRoot, 'scripts/parse-novel.mjs')
const fixturePath = resolve(projectRoot, 'scripts/test/fixtures/novel-sample-gb18030.bin')

test('defaults use the product source path and project-root cache path', () => {
  assert.equal(DEFAULT_SOURCE_PATH, 'F:\\english_context\\蛊真人.txt')
  assert.equal(DEFAULT_OUTPUT_PATH, resolve(projectRoot, 'scripts/.story-cache/novel-index.json'))
})

test('CLI default output is independent of current working directory when --source is provided', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'novel-cli-cwd-'))

  try {
    const result = spawnSync(process.execPath, [scriptPath, '--source', fixturePath], {
      cwd: tempDir,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Parsed chapters: 2/)
    assert.doesNotMatch(result.stdout + result.stderr, /�/)

    const index = JSON.parse(await readFile(DEFAULT_OUTPUT_PATH, 'utf8'))
    assert.equal(index.chapterCount, 2)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
