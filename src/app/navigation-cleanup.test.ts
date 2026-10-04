import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pages = [
  'story/page.tsx', 'review/page.tsx', 'search/page.tsx',
  'bookmarks/page.tsx', 'word/[id]/page.tsx', 'list/[groupId]/page.tsx',
]

describe('word-learning entries and stable page width', () => {
  it('keeps the direct learn page without restoring old entry points or removing the relearn API', () => {
    expect(existsSync(new URL('./learn/page.tsx', import.meta.url))).toBe(true)
    expect(existsSync(new URL('./learn/loading.tsx', import.meta.url))).toBe(false)
    expect(existsSync(new URL('./api/kaoyan/learn/route.ts', import.meta.url))).toBe(true)
  })

  it.each(pages)('does not restore removed redundant learn links in %s', (page) => {
    const source = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8')
    expect(source.match(/["'`]\/learn(?:[?"'`])/g) ?? []).toHaveLength(0)
  })

  it('reserves the root scrollbar gutter when content becomes scrollable', () => {
    const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable\s*;/)
  })
})
