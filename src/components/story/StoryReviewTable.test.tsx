/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  StoryReviewTable,
  type StoryReviewAttemptView,
  type StoryReviewTableWord,
} from './StoryReviewTable'

const words: StoryReviewTableWord[] = [
  {
    lessonWordId: 'lesson-word-1',
    word: 'resolve',
    gloss: '决意',
    phonetic: '/rɪˈzɒlv/',
    partOfSpeech: 'v.',
    dueRound: 2,
    roundCompleted: 1,
    nextReviewAt: null,
    isDue: true,
  },
  {
    lessonWordId: 'lesson-word-2',
    word: 'scheme',
    gloss: '谋划',
    phonetic: null,
    partOfSpeech: 'n.',
    dueRound: 3,
    roundCompleted: 2,
    nextReviewAt: '2026-08-24T00:00:00.000Z',
    isDue: false,
  },
  {
    lessonWordId: 'lesson-word-3',
    word: 'steadfast',
    gloss: '坚定的',
    phonetic: '/ˈstedfæst/',
    partOfSpeech: 'adj.',
    dueRound: null,
    roundCompleted: 5,
    nextReviewAt: null,
    isDue: false,
  },
]

const attempts: StoryReviewAttemptView[] = [
  { lessonWordId: 'lesson-word-1', round: 1, result: 'vague' },
  { lessonWordId: 'lesson-word-2', round: 1, result: 'forgotten' },
  { lessonWordId: 'lesson-word-2', round: 2, result: 'remembered' },
  { lessonWordId: 'lesson-word-3', round: 5, result: 'remembered' },
]

afterEach(cleanup)

describe('StoryReviewTable', () => {
  it('renders five rounds, places completed results in their exact columns, and disables non-due/future actions', () => {
    render(<StoryReviewTable words={words} attempts={attempts} onSubmit={vi.fn()} />)

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '目标词',
      '释义',
      '第1轮',
      '第2轮',
      '第3轮',
      '第4轮',
      '第5轮',
      '下次到期',
    ])

    const resolveRow = screen.getByRole('row', { name: /resolve/ })
    const resolveCells = within(resolveRow).getAllByRole('cell')
    expect(resolveCells[1]).toHaveTextContent('模糊')
    expect(within(resolveCells[2]).getByRole('button', { name: 'resolve 第2轮：记得' })).toBeEnabled()
    expect(within(resolveCells[3]).getByRole('button', { name: 'resolve 第3轮未到期' })).toBeDisabled()

    const schemeRow = screen.getByRole('row', { name: /scheme/ })
    const schemeCells = within(schemeRow).getAllByRole('cell')
    expect(schemeCells[1]).toHaveTextContent('忘记')
    expect(schemeCells[2]).toHaveTextContent('记得')
    expect(within(schemeCells[3]).getByRole('button', { name: 'scheme 第3轮未到期' })).toBeDisabled()

    const steadfastRow = screen.getByRole('row', { name: /steadfast/ })
    const steadfastCells = within(steadfastRow).getAllByRole('cell')
    expect(steadfastCells[5]).toHaveTextContent('记得')
    expect(within(steadfastRow).queryByRole('button', { name: /：记得$/ })).not.toBeInTheDocument()
  })

  it.each([
    ['记得', 'remembered'],
    ['模糊', 'vague'],
    ['忘记', 'forgotten'],
  ] as const)('submits %s with the exact %s identifier', async (label, result) => {
    const onSubmit = vi.fn().mockResolvedValue({
      lessonWordId: 'lesson-word-1',
      round: 2,
      roundCompleted: 2,
      nextReviewAt: '2026-08-23T08:00:00.000Z',
      result,
      grade: 4,
      userWordMeaningMastery: 42,
      userWordMastery: 40,
    })
    render(<StoryReviewTable words={[words[0]]} attempts={[attempts[0]]} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: `resolve 第2轮：${label}` }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      lessonWordId: 'lesson-word-1',
      result,
    }))
    const row = screen.getByRole('row', { name: /resolve/ })
    const cells = within(row).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent(label)
    expect(row).toHaveTextContent('2026-08-23')
  })

  it('reveals a gloss without submitting mastery or changing review progress', () => {
    const onSubmit = vi.fn()
    render(<StoryReviewTable words={[words[0]]} attempts={[attempts[0]]} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: '显示并固定释义' }))

    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    const row = screen.getByRole('row', { name: /resolve/ })
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('模糊')
    expect(within(row).getByRole('button', { name: 'resolve 第2轮：记得' })).toBeEnabled()
  })

  it('announces submission failures and preserves the due row state for retry', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('network down'))
    render(<StoryReviewTable words={[words[0]]} attempts={[attempts[0]]} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'resolve 第2轮：忘记' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('未能保存 resolve 的第2轮复习')
    const row = screen.getByRole('row', { name: /resolve/ })
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('模糊')
    expect(within(row).getByRole('button', { name: 'resolve 第2轮：忘记' })).toBeEnabled()
  })
})
