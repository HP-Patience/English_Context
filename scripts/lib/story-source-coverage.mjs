export function parseChapterReference(value) {
  if (Number.isInteger(value)) return value
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value !== 'string') return null
  const asciiMatch = value.match(/\d+/)
  if (asciiMatch) return Number(asciiMatch[0])
  const chineseMatch = value.match(/[零〇○一二两三四五六七八九十百千万亿]+/u)
  return chineseMatch ? parseChineseInteger(chineseMatch[0]) : null
}

export function validateSourceIndexCoverage({ lessons, sourceChapters, label = 'lessons' }) {
  const errors = []
  if (!Array.isArray(sourceChapters) || sourceChapters.length === 0) {
    return ['source index must contain a non-empty chapters array']
  }
  const sourceOrders = sourceChapters.map((chapter, index) => {
    const order = parseChapterReference(chapter?.order)
    if (!Number.isInteger(order) || order < 1) errors.push(`sourceChapters[${index}].order must be a positive integer`)
    return order
  })
  for (let index = 1; index < sourceOrders.length; index += 1) {
    if (sourceOrders[index] <= sourceOrders[index - 1]) {
      errors.push(`source chapter orders must be unique ascending; received ${sourceOrders[index - 1]}, ${sourceOrders[index]}`)
    }
  }
  if (errors.length > 0 || !Array.isArray(lessons)) return errors

  const indexByOrder = new Map(sourceOrders.map((order, index) => [order, index]))
  let cursor = 0
  for (const [lessonIndex, lesson] of lessons.entries()) {
    const path = `${label}[${lessonIndex}]`
    const start = parseChapterReference(lesson?.sourceChapterStart)
    const end = parseChapterReference(lesson?.sourceChapterEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      errors.push(`${path} source chapter range is not numeric`)
      continue
    }
    const startIndex = indexByOrder.get(start)
    const endIndex = indexByOrder.get(end)
    if (startIndex === undefined) errors.push(`${path} starts at chapter ${start}, which is not in the source index`)
    if (endIndex === undefined) errors.push(`${path} ends at chapter ${end}, which is not in the source index`)
    if (startIndex === undefined || endIndex === undefined) continue
    if (endIndex < startIndex) {
      errors.push(`${path} source chapter range is backward: ${start}-${end}`)
      continue
    }
    if (startIndex > cursor) {
      for (const omitted of sourceOrders.slice(cursor, startIndex)) errors.push(`omitted source chapter ${omitted} before ${path}`)
    } else if (startIndex < cursor) {
      errors.push(`${path} overlaps already covered source chapter ${sourceOrders[startIndex]}`)
    }
    cursor = Math.max(cursor, endIndex + 1)
  }
  for (const omitted of sourceOrders.slice(cursor)) errors.push(`omitted source chapter ${omitted} after final lesson`)
  return errors
}

const CHINESE_DIGITS = new Map([
  ['零', 0], ['〇', 0], ['○', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9],
])
const CHINESE_UNITS = new Map([['十', 10], ['百', 100], ['千', 1000], ['万', 10000], ['亿', 100000000]])

function parseChineseInteger(text) {
  if (!text) return null
  let total = 0
  let section = 0
  let number = 0
  for (const char of text) {
    if (CHINESE_DIGITS.has(char)) { number = CHINESE_DIGITS.get(char); continue }
    const unit = CHINESE_UNITS.get(char)
    if (!unit) return null
    if (unit === 10000 || unit === 100000000) {
      section = (section + (number || 0)) * unit
      total += section
      section = 0
    } else section += (number || 1) * unit
    number = 0
  }
  return total + section + number
}
