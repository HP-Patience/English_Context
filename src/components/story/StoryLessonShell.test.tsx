/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoryLessonDetail, StoryLessonWordListItem } from '@/lib/story-service'
import type { StoryWordDisplay } from './StoryWordDetail'
import { StoryLessonShell } from './StoryLessonShell'
import { StoryWordList } from './StoryWordList'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const lesson: StoryLessonDetail = {
  id: 'lesson-1',
  order: 1,
  title: '青茅山醒来',
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第三章',
  content: {
    title: '青茅山醒来',
    order: 1,
    sourceChapterStart: '第一章',
    sourceChapterEnd: '第三章',
    sourceSummary: '方源重回少年时代。',
    continuityNotes: '故事由重生开始。',
    paragraphs: [
      {
        sceneTitle: '雨夜重生',
        segments: [
          { type: 'text', value: '<img src=x onerror="alert(1)">雨声压住山寨的喧嚣，方源仍然 ' },
          { type: 'targetWord', word: 'resolve', definitionCn: '决意', wordOrder: 1 },
          { type: 'text', value: ' 地望向窗外。' },
        ],
      },
      {
        sceneTitle: '学堂试探',
        segments: [
          { type: 'text', value: '翌日，他以平静掩住真正的 ' },
          { type: 'targetWord', word: 'scheme', definitionCn: '谋划', wordOrder: 2 },
          { type: 'text', value: '。' },
        ],
      },
    ],
  },
  lessonWords: [
    {
      id: 'lesson-word-1',
      sortOrder: 1,
      glossCn: '决意',
      word: { id: 'word-1', text: 'resolve', phonetic: '/rɪˈzɒlv/' },
      meaning: {
        id: 'meaning-1',
        partOfSpeech: 'v.',
        definition: 'decide firmly',
        definitionCn: '下定决心',
        example: 'He resolved to change his fate.',
      },
    },
    {
      id: 'lesson-word-2',
      sortOrder: 2,
      glossCn: '谋划',
      word: { id: 'word-2', text: 'scheme', phonetic: null },
      meaning: {
        id: 'meaning-2',
        partOfSpeech: 'n.',
        definition: 'a secret plan',
        definitionCn: '计谋；计划',
        example: 'His scheme remained hidden in the academy.',
      },
    },
  ],
  progress: {
    userId: 'local-user',
    lessonId: 'lesson-1',
    status: 'not_started',
    currentStep: 1,
    completedStep: 0,
    step1CompletedAt: null,
    step2CompletedAt: null,
    step3CompletedAt: null,
    completedAt: null,
  },
  dueReviewCount: 2,
}

function progressResponse(step: 1 | 2 | 3) {
  return {
    progress: {
      ...lesson.progress,
      status: step === 3 ? 'first_passed' : 'learning',
      currentStep: step === 3 ? 4 : step + 1,
      completedStep: step,
      step1CompletedAt: step >= 1 ? '2026-08-21T12:00:00.000Z' : null,
      step2CompletedAt: step >= 2 ? '2026-08-21T12:01:00.000Z' : null,
      step3CompletedAt: step >= 3 ? '2026-08-21T12:02:00.000Z' : null,
      completedAt: step === 3 ? '2026-08-21T12:02:00.000Z' : null,
    },
  }
}

describe('StoryLessonShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(1) })
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(2) })
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(3) }))
  })

  it('starts with structured English targets and Chinese context glosses while later steps stay locked', () => {
    const { container } = render(
      <StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />,
    )

    expect(screen.getByRole('heading', { level: 2, name: '第一步 · 入境识词' })).toBeInTheDocument()
    expect(screen.getByText('resolve')).toBeInTheDocument()
    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(screen.getByText('scheme')).toBeInTheDocument()
    expect(screen.getByText('谋划')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二步/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /第三步/ })).toBeDisabled()
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">雨声压住/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('persists Step1 before opening recall, keeps English visible, and hides glosses by default', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenLastCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ step: 1 }),
    }))
    expect(await screen.findByRole('heading', { level: 2, name: '第二步 · 遮义回想' })).toBeInTheDocument()
    expect(screen.getAllByText('resolve').length).toBeGreaterThan(0)
    expect(screen.queryByText('决意')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记得' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '模糊' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '忘记' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '显示 resolve 的释义' }))
    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '记得' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '模糊' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '忘记' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '模糊' }))
    expect(screen.getByRole('status')).toHaveTextContent('resolve：模糊')

    fireEvent.click(screen.getByRole('button', { name: '下一个' }))
    expect(screen.getByRole('button', { name: '记得' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '上一个' }))
    expect(screen.getByRole('button', { name: '记得' })).toBeDisabled()
    expect(screen.queryByText('决意')).not.toBeInTheDocument()
  })

  it('keeps the reader on the current step and announces a failed progress request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'failed' }) }))
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('当前步骤不会被跳过')
    expect(screen.getByRole('heading', { level: 2, name: '第一步 · 入境识词' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二步/ })).toBeDisabled()
    expect(fetch).toHaveBeenCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      body: JSON.stringify({ step: 1 }),
    }))
  })

  it('lets readers revisit a completed step and return to the next unlocked step without reposting progress', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))
    await screen.findByRole('heading', { level: 2, name: '第二步 · 遮义回想' })
    fireEvent.click(screen.getByRole('button', { name: /第一步/ }))

    expect(screen.getByRole('button', { name: '返回第二步' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回第二步' }))

    expect(screen.getByRole('heading', { level: 2, name: '第二步 · 遮义回想' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not open Step3 until Step2 is persisted, then renders the complete scene-grouped word ledger', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))
    await screen.findByRole('heading', { level: 2, name: '第二步 · 遮义回想' })
    expect(screen.getByRole('button', { name: /第三步/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '完成第二步，查看词册' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenLastCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      body: JSON.stringify({ step: 2 }),
    }))

    expect(await screen.findByRole('heading', { level: 2, name: '第三步 · 归卷复习' })).toBeInTheDocument()
    const rainScene = screen.getByRole('region', { name: '雨夜重生' })
    const academyScene = screen.getByRole('region', { name: '学堂试探' })
    expect(within(rainScene).getByRole('heading', { name: 'resolve' })).toBeInTheDocument()
    expect(within(academyScene).getByRole('heading', { name: 'scheme' })).toBeInTheDocument()
    expect(screen.getByText('v.')).toBeInTheDocument()
    expect(screen.getByText('下定决心')).toBeInTheDocument()
    expect(screen.getByText('He resolved to change his fate.')).toBeInTheDocument()
    expect(screen.getByText('/rɪˈzɒlv/')).toBeInTheDocument()
    expect(screen.getByText('音标暂无')).toBeInTheDocument()
  })

  it('completes Step3 without Step4, then immediately offers the next lesson and due reinforcement', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))
    await screen.findByRole('heading', { name: '第二步 · 遮义回想' })
    fireEvent.click(screen.getByRole('button', { name: '完成第二步，查看词册' }))
    await screen.findByRole('heading', { name: '第三步 · 归卷复习' })
    fireEvent.click(screen.getByRole('button', { name: '完成第三步' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(fetch).toHaveBeenLastCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      body: JSON.stringify({ step: 3 }),
    }))
    expect(await screen.findByRole('link', { name: '进入下一篇' })).toHaveAttribute('href', '/story/lesson-2')
    expect(screen.getByRole('link', { name: '查看 2 个到期强化词' })).toHaveAttribute('href', '#step-4')
    expect(screen.getByText(/Step4 不会阻塞下一篇/)).toBeInTheDocument()
  })
})

describe('StoryWordList', () => {
  const words: StoryWordDisplay[] = [
    { ...lesson.lessonWords[0], sceneTitle: '雨夜重生', storyUsage: '他把决意藏在窗外的雨幕里。' },
    { ...lesson.lessonWords[1], sceneTitle: '学堂试探', storyUsage: '计谋只在学堂钟声之后浮现。' },
  ]

  it('keeps a 100-word lesson readable by grouping the complete ledger into scene regions', () => {
    const hundredWords: StoryLessonWordListItem[] = Array.from({ length: 100 }, (_, index) => ({
      ...lesson.lessonWords[index % lesson.lessonWords.length],
      id: `lesson-word-${index + 1}`,
      sortOrder: index + 1,
      word: { id: `word-${index + 1}`, text: `target-${index + 1}`, phonetic: null },
      sceneTitle: `场景 ${Math.floor(index / 25) + 1}`,
    }))

    render(<StoryWordList lessonWords={hundredWords} query="" scene="" />)

    expect(screen.getAllByRole('article')).toHaveLength(100)
    expect(screen.getAllByRole('region')).toHaveLength(4)
    expect(screen.getByText('No. 100')).toBeInTheDocument()
  })
  it('matches a query found only in story usage', () => {
    render(<StoryWordList lessonWords={words} query="窗外的雨幕" scene="" />)

    expect(screen.getByRole('heading', { name: 'resolve' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'scheme' })).not.toBeInTheDocument()
  })

  it('honors query and scene filters while preserving the ordered scene contract', () => {
    const { rerender } = render(<StoryWordList lessonWords={words} query="scheme" scene="" />)

    expect(screen.queryByRole('heading', { name: 'resolve' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'scheme' })).toBeInTheDocument()

    rerender(<StoryWordList lessonWords={words} query="" scene="雨夜重生" />)
    expect(screen.getByRole('heading', { name: 'resolve' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'scheme' })).not.toBeInTheDocument()
  })
})
