/**
 * @typedef {Object} StoryLessonDocument
 * @property {string} title
 * @property {number} order
 * @property {string} sourceChapterStart
 * @property {string} sourceChapterEnd
 * @property {string} sourceSummary
 * @property {string} continuityNotes
 * @property {Array<StoryLessonParagraph>} paragraphs
 */

/**
 * @typedef {Object} StoryLessonParagraph
 * @property {string} sceneTitle
 * @property {Array<StoryLessonSegment>} segments
 */

/**
 * @typedef {TextSegment | TargetWordSegment} StoryLessonSegment
 */

/**
 * @typedef {Object} TextSegment
 * @property {'text'} type
 * @property {string} value
 */

/**
 * @typedef {Object} TargetWordSegment
 * @property {'targetWord'} type
 * @property {string} word
 * @property {string} definitionCn
 * @property {string} phonetic
 * @property {number} wordOrder
 */

const DEFAULT_MAX_TARGET_WORDS = 100
const HARD_MAX_TARGET_WORDS = 100

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function addRequiredStringError(errors, value, path) {
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`)
  }
}

function countChineseCharacters(value) {
  if (typeof value !== 'string') return 0
  return (value.match(/[㐀-鿿]/gu) ?? []).length
}

function addSimplifiedChineseTextError(errors, value, path) {
  if (typeof value !== 'string') {
    return
  }

  const text = value.trim()
  if (!text) {
    return
  }

  const cjkCount = (text.match(/[\u3400-\u9fff]/gu) ?? []).length
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length
  if (cjkCount === 0 && latinCount > 0) {
    errors.push(`${path} must be written in Simplified Chinese (简体中文)`)
    return
  }

  if (latinCount >= 20 && latinCount > cjkCount * 2) {
    errors.push(`${path} must be predominantly Simplified Chinese (简体中文), not English`)
  }
}

const STORY_META_COMMENTARY_PHRASES = [
  '本课围绕',
  '主线推进',
  '前半段推进',
  '后半段收束',
  '承接前半段',
  '把故事的重心',
  '强化了冲突感',
  '让读者更清楚角色的判断',
  '把前后情节自然接上',
  '让人物的选择更有层次',
  '推进故事主线',
  '留下明显伏笔',
  '故事已经推进到新的转折点',
  '为下一课留下明显伏笔',
  '感悟',
  '点评',
  '分析',
]

function addStoryNarrativeQualityError(errors, value, path) {
  if (typeof value !== 'string') {
    return
  }

  const text = value.trim()
  if (!text) {
    return
  }

  const hits = STORY_META_COMMENTARY_PHRASES.filter((phrase) => text.includes(phrase))
  if (hits.length > 0) {
    errors.push(`${path} must be story narration, not meta commentary or template language (${hits[0]})`)
    return
  }

  const templateOpeners = ['这一处', '这一层', '这一句', '这一点']
  if (templateOpeners.some((phrase) => text.includes(phrase)) && /(?:故事的重心|冲突感|角色的判断|前后情节|人物的选择|故事主线|明显伏笔|局势变化)/.test(text)) {
    errors.push(`${path} must be story narration, not template commentary`)
  }
}

function getMaxTargetWords(context, errors) {
  const requested = context?.maxTargetWords ?? DEFAULT_MAX_TARGET_WORDS

  if (!Number.isInteger(requested) || requested < 1) {
    errors.push('context.maxTargetWords must be a positive integer')
    return DEFAULT_MAX_TARGET_WORDS
  }

  return Math.min(requested, HARD_MAX_TARGET_WORDS)
}

/**
 * Validate that a value conforms to the structured story lesson contract.
 *
 * @param {unknown} value
 * @param {{ maxTargetWords?: number }} [context]
 * @returns {{ ok: true, value: StoryLessonDocument } | { ok: false, errors: string[] }}
 */
export function validateLessonDocument(value, context = {}) {
  const errors = []
  const maxTargetWords = getMaxTargetWords(context, errors)
  const seenWordOrders = new Set()
  let targetWordCount = 0

  if (!isPlainObject(value)) {
    return { ok: false, errors: ['lesson document must be an object', ...errors] }
  }

  addRequiredStringError(errors, value.title, 'title')
  addSimplifiedChineseTextError(errors, value.title, 'title')
  addStoryNarrativeQualityError(errors, value.title, 'title')

  if (!Number.isInteger(value.order) || value.order < 1) {
    errors.push('order must be a positive integer')
  }

  addRequiredStringError(errors, value.sourceChapterStart, 'sourceChapterStart')
  addRequiredStringError(errors, value.sourceChapterEnd, 'sourceChapterEnd')
  addRequiredStringError(errors, value.sourceSummary, 'sourceSummary')
  addRequiredStringError(errors, value.continuityNotes, 'continuityNotes')
  addSimplifiedChineseTextError(errors, value.sourceSummary, 'sourceSummary')
  addSimplifiedChineseTextError(errors, value.continuityNotes, 'continuityNotes')
  addStoryNarrativeQualityError(errors, value.sourceSummary, 'sourceSummary')
  addStoryNarrativeQualityError(errors, value.continuityNotes, 'continuityNotes')

  if (!Array.isArray(value.paragraphs) || value.paragraphs.length === 0) {
    errors.push('paragraphs must be a non-empty array')
  } else {
    for (const [paragraphIndex, paragraph] of value.paragraphs.entries()) {
      const paragraphPath = `paragraphs[${paragraphIndex}]`

      if (!isPlainObject(paragraph)) {
        errors.push(`${paragraphPath} must be an object`)
        continue
      }

      addRequiredStringError(errors, paragraph.sceneTitle, `${paragraphPath}.sceneTitle`)
      addSimplifiedChineseTextError(errors, paragraph.sceneTitle, `${paragraphPath}.sceneTitle`)
      addStoryNarrativeQualityError(errors, paragraph.sceneTitle, `${paragraphPath}.sceneTitle`)

      if (!Array.isArray(paragraph.segments) || paragraph.segments.length === 0) {
        errors.push(`${paragraphPath}.segments must be a non-empty array`)
        continue
      }

      let previousTargetWordPath = null
      let textSincePreviousTargetWord = ''

      for (const [segmentIndex, segment] of paragraph.segments.entries()) {
        const segmentPath = `${paragraphPath}.segments[${segmentIndex}]`

        if (!isPlainObject(segment)) {
          errors.push(`${segmentPath} must be an object`)
          continue
        }

        if (segment.type === 'text') {
          addRequiredStringError(errors, segment.value, `${segmentPath}.value`)
          addSimplifiedChineseTextError(errors, segment.value, `${segmentPath}.value`)
          addStoryNarrativeQualityError(errors, segment.value, `${segmentPath}.value`)
          if (previousTargetWordPath !== null && typeof segment.value === 'string') {
            textSincePreviousTargetWord += segment.value
          }
          continue
        }

        if (segment.type === 'targetWord') {
          if (previousTargetWordPath !== null) {
            const separatingChineseCharacters = countChineseCharacters(textSincePreviousTargetWord)
            if (separatingChineseCharacters < 6) {
              errors.push(`${segmentPath} must be naturally embedded in the story; write at least 6 Chinese narrative characters between target words after ${previousTargetWordPath}`)
            }
          }
          previousTargetWordPath = segmentPath
          textSincePreviousTargetWord = ''
          targetWordCount += 1
          addRequiredStringError(errors, segment.word, `${segmentPath}.word`)
          addRequiredStringError(errors, segment.definitionCn, `${segmentPath}.definitionCn`)
          addRequiredStringError(errors, segment.phonetic, `${segmentPath}.phonetic`)
          addSimplifiedChineseTextError(errors, segment.definitionCn, `${segmentPath}.definitionCn`)

          if (!Number.isInteger(segment.wordOrder) || segment.wordOrder < 1) {
            errors.push(`${segmentPath}.wordOrder must be a positive integer`)
          } else if (seenWordOrders.has(segment.wordOrder)) {
            errors.push(`${segmentPath}.wordOrder must be unique; duplicate value ${segment.wordOrder}`)
          } else {
            seenWordOrders.add(segment.wordOrder)
          }

          continue
        }

        errors.push(`${segmentPath}.type must be either "text" or "targetWord"`)
      }
    }
  }

  if (targetWordCount > maxTargetWords) {
    errors.push(`lesson has ${targetWordCount} target words; maximum is ${maxTargetWords}`)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, value }
}

/**
 * Parse a value as a story lesson document, throwing when validation fails.
 *
 * @param {unknown} value
 * @param {{ maxTargetWords?: number }} [context]
 * @returns {StoryLessonDocument}
 */
export function parseLessonDocument(value, context = {}) {
  const result = validateLessonDocument(value, context)

  if (!result.ok) {
    throw new TypeError(`Invalid story lesson document:\n${result.errors.join('\n')}`)
  }

  return result.value
}
