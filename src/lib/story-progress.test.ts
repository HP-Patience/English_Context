import { describe, expect, it } from 'vitest'
import { parseStoryContent } from './story-types'
import {
  canOpenLesson,
  completeFirstPass,
  getNextStep,
  initialProgress,
} from './story-progress'

const validContent = JSON.stringify({
  title: 'Story 01：青茅山的重生',
  order: 1,
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第三章',
  sourceSummary: '方源在青茅山醒来并确认重生。',
  continuityNotes: '下一篇进入资质检测。',
  paragraphs: [
    {
      sceneTitle: '醒来',
      segments: [
        { type: 'text', value: '他回到了 ' },
        { type: 'targetWord', word: 'dorm', definitionCn: '宿舍', phonetic: '/dɔːm/', wordOrder: 1 },
        { type: 'text', value: '。' },
      ],
    },
  ],
})

describe('parseStoryContent', () => {
  it('parses the persisted story lesson JSON contract', () => {
    const content = parseStoryContent(validContent)

    expect(content.title).toBe('Story 01：青茅山的重生')
    expect(content.paragraphs[0]?.segments[1]).toEqual({
      type: 'targetWord',
      word: 'dorm',
      definitionCn: '宿舍',
      phonetic: '/dɔːm/',
      wordOrder: 1,
    })
  })

  it('rejects persisted target words without generated phonetics', () => {
    const missingPhonetic = JSON.parse(validContent)
    delete missingPhonetic.paragraphs[0].segments[1].phonetic

    expect(() => parseStoryContent(JSON.stringify(missingPhonetic))).toThrow(
      /phonetic must be a non-empty string/,
    )
  })

  it('throws a descriptive Error for invalid persisted JSON', () => {
    expect(() => parseStoryContent('{"title":"missing fields"}')).toThrow(
      /Invalid story lesson content:[\s\S]*order must be a positive integer/,
    )
  })
})

describe('story first-pass progress', () => {
  it('starts unopened lessons at Step1', () => {
    expect(initialProgress).toEqual({
      status: 'not_started',
      completedSteps: [],
      reviewRoundCompleted: 0,
    })
    expect(getNextStep(initialProgress)).toBe(1)
    expect(canOpenLesson(initialProgress)).toBe(true)
  })

  it('advances Step1 through Step3 sequentially', () => {
    const afterStep1 = completeFirstPass(initialProgress, 1)
    const afterStep2 = completeFirstPass(afterStep1, 2)
    const afterStep3 = completeFirstPass(afterStep2, 3)

    expect(afterStep1).toMatchObject({ status: 'learning', completedSteps: [1] })
    expect(getNextStep(afterStep1)).toBe(2)
    expect(afterStep2).toMatchObject({ status: 'learning', completedSteps: [1, 2] })
    expect(getNextStep(afterStep2)).toBe(3)
    expect(afterStep3).toMatchObject({ status: 'first_passed', completedSteps: [1, 2, 3] })
    expect(getNextStep(afterStep3)).toBe(4)
  })

  it('rejects out-of-order first-pass completion', () => {
    expect(() => completeFirstPass(initialProgress, 2)).toThrow(
      /Cannot complete Step2 before Step1/,
    )
  })

  it('unlocks the next lesson after Step3 without five Step4 rounds', () => {
    const progress = completeFirstPass(
      completeFirstPass(
        completeFirstPass(initialProgress, 1),
        2,
      ),
      3,
    )

    expect(progress.status).toBe('first_passed')
    expect(canOpenLesson(progress)).toBe(true)
  })

  it('keeps Step4 reinforcement from blocking lesson access', () => {
    expect(canOpenLesson({
      status: 'reviewing',
      completedSteps: [1, 2, 3],
      reviewRoundCompleted: 4,
    })).toBe(true)
  })
})
