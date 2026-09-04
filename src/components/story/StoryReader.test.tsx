/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoryLessonWordDto } from '@/lib/story-service'
import type { StoryLessonParagraph } from '@/lib/story-types'
import { StoryReader } from './StoryReader'

const paragraphs: StoryLessonParagraph[] = [
  {
    sceneTitle: '雨夜重生',
    segments: [
      { type: 'text', value: '他终于 ' },
      { type: 'targetWord', word: 'resolve', definitionCn: '决意', phonetic: '/rɪˈzɒlv/', wordOrder: 1 },
      { type: 'text', value: '。' },
    ],
  },
  {
    sceneTitle: '学堂试探',
    segments: [
      { type: 'text', value: '他藏起 ' },
      { type: 'targetWord', word: 'scheme', definitionCn: '谋划', phonetic: '/skiːm/', wordOrder: 2 },
      { type: 'text', value: '。' },
    ],
  },
]

const lessonWords: StoryLessonWordDto[] = [
  {
    id: 'lesson-word-1', sortOrder: 1, glossCn: '决意', bookmarked: false,
    word: { id: 'word-1', text: 'resolve', phonetic: '/rɪˈzɒlv/' },
    meaning: { id: 'meaning-1', partOfSpeech: 'v.', definition: 'decide', definitionCn: '决意', example: null },
  },
  {
    id: 'lesson-word-2', sortOrder: 2, glossCn: '谋划', bookmarked: true,
    word: { id: 'word-2', text: 'scheme', phonetic: '/skiːm/' },
    meaning: { id: 'meaning-2', partOfSpeech: 'n.', definition: 'plan', definitionCn: '谋划', example: null },
  },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StoryReader paragraph cards', () => {
  it('renders title detail links, target links, independent gloss toggles, and shared progress on every card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ completions: [] }) }))
    render(
      <StoryReader
        lessonId="lesson-1"
        paragraphs={paragraphs}
        lessonWords={lessonWords}
        mode="learn"
        completedCards={4}
        totalCards={15}
        bookmarkedParagraphIndexes={new Set()}
        onParagraphBookmarkChange={() => undefined}
      />,
    )

    const cards = screen.getAllByRole('article', { name: /故事段落/ })
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(within(card).getByText('故事学习进度 4/15')).toBeInTheDocument()
      expect(within(card).getByRole('progressbar', { name: '段落完成进度' })).toHaveAttribute('aria-valuenow', '4')
      expect(within(card).getByRole('progressbar', { name: '段落完成进度' })).toHaveAttribute('aria-valuemax', '15')
      expect(within(card).getByRole('progressbar', { name: '段落完成进度' })).toHaveAttribute(
        'aria-valuetext',
        '已完成 4 段，共 15 段',
      )
    }
    expect(screen.getByRole('link', { name: 'resolve' })).toHaveAttribute('href', '/word/word-1')
    expect(screen.getByRole('link', { name: 'scheme' })).toHaveAttribute('href', '/word/word-2')
    expect(screen.getByRole('link', { name: '雨夜重生' })).toHaveAttribute('href', '/story/lesson-1/cards/0')
    expect(screen.getByRole('link', { name: '学堂试探' })).toHaveAttribute('href', '/story/lesson-1/cards/1')
    expect(screen.queryByRole('link', { name: '查看本段详情' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看本段详情' })).not.toBeInTheDocument()

    const visibleGloss = screen.getByRole('button', { name: '隐藏段内 resolve 的释义：决意' })
    expect(visibleGloss).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(visibleGloss)
    expect(screen.getByText('决意')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('谋划')).toHaveAttribute('aria-hidden', 'false')
    const hiddenGloss = screen.getByRole('button', { name: '显示段内 resolve 的释义' })
    expect(hiddenGloss).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(hiddenGloss)
    expect(hiddenGloss).toHaveAccessibleName('隐藏段内 resolve 的释义：决意')
    expect(screen.getByText('决意')).toHaveAttribute('aria-hidden', 'false')
  })

  it('updates the shared completed-card count on every card after a first paragraph completion', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            completion: { id: 'event-1', completionId: 'completion-1', date: '2026-08-22', createdAt: '2026-08-22T00:00:00.000Z' },
          }),
        }
      }
      return { ok: true, json: async () => ({ completions: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <StoryReader
        lessonId="lesson-1"
        paragraphs={paragraphs}
        lessonWords={lessonWords}
        mode="learn"
        completedCards={4}
        totalCards={15}
        bookmarkedParagraphIndexes={new Set()}
        onParagraphBookmarkChange={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '记录或查看第 1 段完成日期历史' }))
    const picker = await screen.findByLabelText('第 1 段完成日期')
    fireEvent.change(picker, { target: { value: '2026-08-22' } })
    fireEvent.click(screen.getAllByRole('button', { name: '保存日期' })[0])

    await waitFor(() => expect(screen.getAllByText('故事学习进度 5/15')).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/story/lessons/lesson-1/paragraphs/0/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reports first completions so shared progress survives a learning-view remount', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          completion: { id: 'event-1', completionId: 'completion-1', date: '2026-08-22', createdAt: '2026-08-22T00:00:00.000Z' },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ completions: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    function LearningViews() {
      const [view, setView] = useState(1)
      const [completed, setCompleted] = useState(4)
      return (
        <>
          <button type="button" onClick={() => setView((current) => current + 1)}>切换学习视图</button>
          <StoryReader
            key={view}
            lessonId="lesson-1"
            paragraphs={paragraphs}
            lessonWords={lessonWords}
            mode="learn"
            completedCards={completed}
            totalCards={15}
            bookmarkedParagraphIndexes={new Set()}
            onParagraphBookmarkChange={() => undefined}
            onFirstParagraphCompletion={() => setCompleted((current) => current + 1)}
          />
        </>
      )
    }

    render(<LearningViews />)
    fireEvent.click(screen.getByRole('button', { name: '记录或查看第 1 段完成日期历史' }))
    const picker = await screen.findByLabelText('第 1 段完成日期')
    fireEvent.change(picker, { target: { value: '2026-08-22' } })
    fireEvent.click(screen.getAllByRole('button', { name: '保存日期' })[0])
    await waitFor(() => expect(screen.getAllByText('故事学习进度 5/15')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: '切换学习视图' }))
    expect(screen.getAllByText('故事学习进度 5/15')).toHaveLength(2)
  })

  it('keeps 100 paragraph histories lazy while loading and saving expanded cards independently', async () => {
    const manyParagraphs: StoryLessonParagraph[] = Array.from({ length: 100 }, (_, index) => ({
      sceneTitle: `段落 ${index + 1}`,
      segments: [{ type: 'text', value: `内容 ${index + 1}` }],
    }))
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const paragraphIndex = Number(/paragraphs\/(\d+)/.exec(input)?.[1] ?? -1)
      if (init?.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        return Response.json({
          completion: {
            id: `saved-${paragraphIndex}`,
            completionId: payload.completionId,
            date: payload.date,
            createdAt: '2026-09-03T00:00:00.000Z',
          },
        })
      }
      return Response.json({
        completions: [{
          id: `event-${paragraphIndex}`,
          completionId: `completion-${paragraphIndex}`,
          date: paragraphIndex === 0 ? '2026-09-01' : '2026-09-02',
          createdAt: '2026-09-02T00:00:00.000Z',
        }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StoryReader
        lessonId="lesson-100"
        paragraphs={manyParagraphs}
        lessonWords={[]}
        mode="learn"
        completedCards={0}
        totalCards={100}
        bookmarkedParagraphIndexes={new Set()}
        onParagraphBookmarkChange={() => undefined}
      />,
    )

    expect(screen.getAllByRole('button', { name: /记录或查看第 .* 段完成日期历史/ })).toHaveLength(100)
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '记录或查看第 1 段完成日期历史' }))
    fireEvent.click(screen.getByRole('button', { name: '记录或查看第 2 段完成日期历史' }))
    expect(await screen.findByRole('button', { name: '选择日期 2026-09-01' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '选择日期 2026-09-02' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fireEvent.change(screen.getByLabelText('第 1 段完成日期'), { target: { value: '2026-09-03' } })
    fireEvent.click(screen.getAllByRole('button', { name: '保存日期' })[0])

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('button', { name: '选择日期 2026-09-03' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择日期 2026-09-02' })).toBeInTheDocument()
  })
})
