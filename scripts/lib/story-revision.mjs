import { createHash } from 'node:crypto'

export function storyParagraphHash(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function renderStoryParagraph(paragraph) {
  return paragraph.segments.map((segment) => {
    if (segment.type === 'text') return segment.value
    if (segment.type === 'targetWord') return `【${segment.word}=${segment.definitionCn}】`
    throw new Error(`Unknown story segment: ${segment.type}`)
  }).join('')
}

/** Exact paragraph patches only: no substring replacement and no database writes. */
export function reviseStoryParagraph(paragraph, edit) {
  if (typeof edit.before !== 'string' || typeof edit.after !== 'string' || !edit.after.trim()) {
    throw new Error('Revision requires non-empty after text and an exact before text')
  }
  if (storyParagraphHash(edit.before) !== edit.beforeSha256) {
    throw new Error('Revision before hash mismatch')
  }
  const markers = (text) => text.match(/【[^【】]+】/gu) ?? []
  const beforeMarkers = markers(edit.before)
  if (JSON.stringify(beforeMarkers) !== JSON.stringify(markers(edit.after))) {
    throw new Error('Revision must preserve target markers, definitions and order')
  }
  const remainder = edit.after.replace(/【[^【】]+】/gu, '')
  if (/[【】]/u.test(remainder)) throw new Error('Malformed target marker')
  const current = renderStoryParagraph(paragraph)
  if (current === edit.after) return structuredClone(paragraph)
  if (current !== edit.before) throw new Error('Stale paragraph: neither before nor after matches')

  const targets = paragraph.segments.filter((segment) => segment.type === 'targetWord')
  if (targets.length !== beforeMarkers.length) throw new Error('Target segment count mismatch')
  const segments = []
  let offset = 0
  let targetIndex = 0
  for (const match of edit.after.matchAll(/【[^【】]+】/gu)) {
    if (match.index > offset) segments.push({ type: 'text', value: edit.after.slice(offset, match.index) })
    segments.push(structuredClone(targets[targetIndex++]))
    offset = match.index + match[0].length
  }
  if (offset < edit.after.length) segments.push({ type: 'text', value: edit.after.slice(offset) })
  return { ...structuredClone(paragraph), segments }
}

/** Field consistency is mechanical; contextual sense still requires editorial review. */
export function validateStoryMeaningBindings(document, rows) {
  const targets = document.paragraphs.flatMap((paragraph) => paragraph.segments.filter((segment) => segment.type === 'targetWord'))
  const errors = []
  const byOrder = new Map(rows.map((row) => [row.sortOrder, row]))
  if (byOrder.size !== rows.length) errors.push('Duplicate binding sortOrder')
  if (targets.length !== rows.length) errors.push('Target/binding count mismatch')
  const seen = new Set()
  for (const segment of targets) {
    if (seen.has(segment.wordOrder)) errors.push(`Duplicate target wordOrder ${segment.wordOrder}`)
    seen.add(segment.wordOrder)
    const row = byOrder.get(segment.wordOrder)
    if (!row || row.wordId !== row.word?.id || row.meaningId !== row.meaning?.id || row.meaning?.wordId !== row.wordId ||
        row.word?.text !== segment.word || row.glossCn !== segment.definitionCn || row.meaning?.definitionCn !== segment.definitionCn) {
      errors.push(`Meaning binding mismatch at wordOrder ${segment.wordOrder} (${segment.word})`)
    }
  }
  return { ok: errors.length === 0, errors, targetWords: targets.length }
}
