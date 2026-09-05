/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/PronounceButton', () => ({
  default: ({ word }: { word: string }) => <button type="button" aria-label={`播放 ${word} 发音`} />,
}))

vi.mock('./CompletionDateHistory', () => ({
  CompletionDateHistory: ({ endpoint, label }: { endpoint: string; label: string }) => (
    <div data-endpoint={endpoint}>{label}</div>
  ),
}))

import type { StoryLessonDetail, StoryLessonWordDto } from '@/lib/story-service'
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
  completionSummary: {
    lesson: { count: 0, latestDate: null },
    step: { count: 0, latestDate: null },
    paragraph: { count: 1, latestDate: '2026-09-01', completedCards: 1, totalCards: 2 },
    paragraphByStep: {
      1: { count: 1, latestDate: '2026-09-01', completedCards: 1, completedParagraphIndexes: [0] },
      2: { count: 0, latestDate: null, completedCards: 0, completedParagraphIndexes: [] },
    },
  },
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
          { type: 'targetWord', word: 'resolve', definitionCn: '决意', phonetic: '/rɪˈzɒlv/', wordOrder: 1 },
          { type: 'text', value: ' 地望向窗外。' },
        ],
      },
      {
        sceneTitle: '学堂试探',
        segments: [
          { type: 'text', value: '翌日，他以平静掩住真正的 ' },
          { type: 'targetWord', word: 'scheme', definitionCn: '谋划', phonetic: '/skiːm/', wordOrder: 2 },
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
      bookmarked: false,
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
      bookmarked: true,
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
  bookmarkedParagraphIndexes: [0],
  reviewState: {
    words: [
      { lessonWordId: 'lesson-word-1', roundCompleted: 0, nextReviewAt: null },
      { lessonWordId: 'lesson-word-2', roundCompleted: 0, nextReviewAt: null },
    ],
    attempts: [],
  },
}

function progressResponse(step: 1 | 2 | 3): { progress: StoryLessonDetail['progress'] } {
  return {
    progress: {
      ...lesson.progress,
      status: step === 3 ? 'first_passed' : 'learning',
      currentStep: step === 1 ? 2 : step === 2 ? 3 : 4,
      completedStep: step,
      step1CompletedAt: step >= 1 ? '2026-08-21T12:00:00.000Z' : null,
      step2CompletedAt: step >= 2 ? '2026-08-21T12:01:00.000Z' : null,
      step3CompletedAt: step >= 3 ? '2026-08-21T12:02:00.000Z' : null,
      completedAt: step === 3 ? '2026-08-21T12:02:00.000Z' : null,
    },
  }
}

const firstPassedLesson: StoryLessonDetail = {
  ...lesson,
  progress: progressResponse(3).progress,
  dueReviewCount: 1,
  reviewState: {
    words: [
      { lessonWordId: 'lesson-word-1', roundCompleted: 2, nextReviewAt: '2026-08-24T08:00:00.000Z' },
      { lessonWordId: 'lesson-word-2', roundCompleted: 0, nextReviewAt: null },
    ],
    attempts: [
      { lessonWordId: 'lesson-word-1', round: 1, result: 'vague' },
      { lessonWordId: 'lesson-word-1', round: 2, result: 'remembered' },
    ],
  },
}

const lessonReviewQueue = {
  lessons: [{
    lessonId: 'lesson-1',
    lessonOrder: 1,
    lessonTitle: '青茅山醒来',
    dueCount: 1,
    words: [{
      lessonWordId: 'lesson-word-2',
      lessonId: 'lesson-1',
      lessonOrder: 1,
      lessonTitle: '青茅山醒来',
      sortOrder: 2,
      wordId: 'word-2',
      meaningId: 'meaning-2',
      word: 'scheme',
      glossCn: '谋划',
      definitionCn: '计谋；计划',
      dueRound: 1,
      roundCompleted: 0,
      nextReviewAt: null,
    }],
  }],
  dueCount: 1,
}

function reviewResponse(overrides: Record<string, unknown> = {}) {
  return {
    review: {
      lessonWordId: 'lesson-word-1',
      round: 1,
      roundCompleted: 1,
      result: 'remembered',
      nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      grade: 4,
      userWordMeaningMastery: 60,
      userWordMastery: 60,
      ...overrides,
    },
  }
}

describe('StoryLessonShell', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(1) })
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(2) })
      .mockResolvedValueOnce({ ok: true, json: async () => progressResponse(3) }))
  })

  it('starts with paragraph cards and keeps every learning view independently enterable', () => {
    const { container } = render(
      <StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />,
    )

    expect(screen.getByRole('heading', { level: 2, name: '第一步 · 入境识词' })).toBeInTheDocument()
    expect(screen.getByText('resolve')).toBeInTheDocument()
    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(screen.getByText('scheme')).toBeInTheDocument()
    expect(screen.getByText('谋划')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二步/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /第三步/ })).toBeEnabled()
    expect(screen.getByText('第一步完成日期')).toHaveAttribute(
      'data-endpoint',
      '/api/story/lessons/lesson-1/steps/1/completions',
    )
    expect(screen.getAllByRole('article', { name: /故事段落/ })).toHaveLength(2)
    expect(screen.getAllByText('故事学习进度 1/2')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '跳到第 2 个未完成段落' })).toBeInTheDocument()
    expect(screen.getByText('第 1 段完成日期')).toHaveAttribute(
      'data-endpoint',
      '/api/story/lessons/lesson-1/paragraphs/0/completions?step=1',
    )
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">雨声压住/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /第二步/ }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(screen.getByText('第二步完成日期')).toHaveAttribute(
      'data-endpoint',
      '/api/story/lessons/lesson-1/steps/2/completions',
    )
    expect(screen.getByText('第 1 段完成日期')).toHaveAttribute(
      'data-endpoint',
      '/api/story/lessons/lesson-1/paragraphs/0/completions?step=2',
    )
    expect(screen.getAllByText('故事学习进度 0/2')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '跳到第 1 个未完成段落' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /第三步/ }))
    expect(screen.getByText('第三步完成日期')).toHaveAttribute(
      'data-endpoint',
      '/api/story/lessons/lesson-1/steps/3/completions',
    )
  })

  it('sends the storyCard payload and keeps confirmed bookmark state across Step 1 and Step 2', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: 'storyCard', bookmarked: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} />)

    const secondCard = screen.getAllByRole('article', { name: /故事段落/ })[1]
    const bookmark = within(secondCard).getByRole('button', { name: '收藏第 2 段' })
    expect(bookmark).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(bookmark)

    await waitFor(() => expect(bookmark).toHaveAttribute('aria-pressed', 'true'))
    expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'storyCard', lessonId: 'lesson-1', paragraphIndex: 1, bookmarked: true }),
    })

    fireEvent.click(screen.getByRole('button', { name: /第二步/ }))
    const recalledSecondCard = screen.getAllByRole('article', { name: /故事段落/ })[1]
    expect(within(recalledSecondCard).getByRole('button', { name: '取消收藏第 2 段' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the confirmed bookmark state and reports a failed toggle inline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} />)

    const firstCard = screen.getAllByRole('article', { name: /故事段落/ })[0]
    const bookmark = within(firstCard).getByRole('button', { name: '取消收藏第 1 段' })
    fireEvent.click(bookmark)

    expect(await within(firstCard).findByRole('alert')).toHaveTextContent('收藏失败，请重试。')
    expect(bookmark).toHaveAttribute('aria-pressed', 'true')
    expect(bookmark).toHaveAttribute('title', '取消收藏第 1 段')
    expect(bookmark).not.toHaveTextContent(/收藏|保存/)
  })

  it('persists Step1 before opening the full recall reader without a standalone rating panel', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenLastCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ step: 1 }),
    }))
    expect(await screen.findByRole('heading', { level: 2, name: '第二步 · 遮义回想' })).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(screen.getAllByRole('article', { name: /故事段落/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: '取消收藏第 1 段' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('progressbar', { name: '段落完成进度' })).toHaveLength(2)
    expect(screen.getByText('第 1 段完成日期')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '记得' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '模糊' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忘记' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一个' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一个' })).not.toBeInTheDocument()

    const recallGloss = screen.getByRole('button', { name: '显示段内 resolve 的释义' })
    expect(within(recallGloss).getByText('决意')).toHaveAttribute('aria-hidden', 'true')
    expect(recallGloss).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(recallGloss)
    expect(recallGloss).toHaveAttribute('aria-pressed', 'true')
    expect(recallGloss).toHaveAccessibleName('隐藏段内 resolve 的释义：决意')
    expect(within(recallGloss).getByText('决意')).toHaveAttribute('aria-hidden', 'false')
  })

  it('keeps the reader on the current step and announces a failed progress request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'failed' }) }))
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('当前步骤不会被跳过')
    expect(screen.getByRole('heading', { level: 2, name: '第一步 · 入境识词' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二步/ })).toBeEnabled()
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

  it('updates the selected step before settling the deferred story panel', async () => {
    render(<StoryLessonShell lesson={lesson} progress={lesson.progress} dueWords={2} />)

    fireEvent.click(screen.getByRole('button', { name: /第三步/ }))

    expect(screen.getByRole('button', { name: /第三步/ })).toHaveAttribute('aria-current', 'step')
    const heading = await screen.findByRole('heading', { level: 2, name: '第三步 · 归卷复习' })
    expect(heading).toBeInTheDocument()
    expect(heading.closest('.story-step-panel')).toHaveAttribute('aria-busy', 'false')
  })

  it('keeps Step3 enterable while sequential persistence renders an ordered independent gloss reveal list', async () => {
    const lessonWithUnorderedWords = { ...lesson, lessonWords: [...lesson.lessonWords].reverse() }
    render(<StoryLessonShell lesson={lessonWithUnorderedWords} progress={lesson.progress} dueWords={2} nextLessonId="lesson-2" />)

    fireEvent.click(screen.getByRole('button', { name: '完成第一步，进入回忆' }))
    await screen.findByRole('heading', { level: 2, name: '第二步 · 遮义回想' })
    expect(screen.getByRole('button', { name: /第三步/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '完成第二步，查看词册' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenLastCalledWith('/api/story/lessons/lesson-1/progress', expect.objectContaining({
      body: JSON.stringify({ step: 2 }),
    }))

    expect(await screen.findByRole('heading', { level: 2, name: '第三步 · 归卷复习' })).toBeInTheDocument()
    const rows = within(screen.getByRole('list', { name: '本篇目标词' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'resolve' })).toHaveAttribute('href', '/word/word-1')
    expect(within(rows[0]).getByRole('button', { name: '播放 resolve 发音' })).toBeInTheDocument()
    expect(within(rows[0]).getByRole('button', { name: '收藏单词 resolve' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(rows[1]).getByRole('button', { name: '取消收藏单词 scheme' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(rows[1]).getByText('scheme')).toBeInTheDocument()
    expect(screen.queryByText('v.')).not.toBeInTheDocument()
    expect(screen.queryByText('下定决心')).not.toBeInTheDocument()
    expect(screen.queryByText('He resolved to change his fate.')).not.toBeInTheDocument()
    expect(screen.queryByText('/rɪˈzɒlv/')).not.toBeInTheDocument()

    const resolveGloss = within(rows[0]).getByRole('button', { name: '显示 resolve 的释义' })
    const schemeGloss = within(rows[1]).getByRole('button', { name: '显示 scheme 的释义' })
    expect(resolveGloss).toHaveAttribute('aria-expanded', 'false')
    expect(resolveGloss).toHaveAttribute('aria-pressed', 'false')
    expect(schemeGloss).toHaveAttribute('aria-expanded', 'false')
    expect(within(resolveGloss).getByText('点击查看释义')).toHaveAttribute('aria-hidden', 'false')
    const hiddenResolveGloss = within(resolveGloss).getByText('决意')
    expect(hiddenResolveGloss).toHaveAttribute('aria-hidden', 'true')
    expect(hiddenResolveGloss).toHaveClass('opacity-0', 'transition-opacity', 'motion-reduce:transition-none')
    expect(hiddenResolveGloss).toHaveClass('col-start-1', 'row-start-1')

    fireEvent.click(resolveGloss)
    expect(resolveGloss).toHaveAttribute('aria-expanded', 'true')
    expect(resolveGloss).toHaveAttribute('aria-pressed', 'true')
    expect(resolveGloss).toHaveAccessibleName('隐藏 resolve 的释义：决意')
    expect(hiddenResolveGloss).toHaveAttribute('aria-hidden', 'false')
    expect(hiddenResolveGloss).toHaveClass('opacity-100')
    expect(schemeGloss).toHaveAttribute('aria-expanded', 'false')
    expect(within(schemeGloss).getByText('谋划')).toHaveAttribute('aria-hidden', 'true')
  })

  it('restores persisted exact-round results and a non-due schedule after remount while the due queue controls only actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => lessonReviewQueue })
    vi.stubGlobal('fetch', fetchMock)

    const firstRender = render(
      <StoryLessonShell lesson={firstPassedLesson} progress={firstPassedLesson.progress} dueWords={1} nextLessonId="lesson-2" />,
    )

    let resolveRow = screen.getByRole('row', { name: /resolve/ })
    let resolveCells = within(resolveRow).getAllByRole('cell')
    expect(resolveCells[1]).toHaveTextContent('模糊')
    expect(resolveCells[2]).toHaveTextContent('记得')
    expect(resolveRow).toHaveTextContent('2026-08-24')

    fireEvent.click(screen.getByRole('button', { name: '载入到期强化词' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/story/review?lessonId=lesson-1'))
    expect(within(resolveRow).getByRole('button', { name: 'resolve 第3轮未到期' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'scheme 第1轮：记得' })).toBeEnabled()

    firstRender.unmount()
    render(<StoryLessonShell lesson={firstPassedLesson} progress={firstPassedLesson.progress} dueWords={1} nextLessonId="lesson-2" />)

    resolveRow = screen.getByRole('row', { name: /resolve/ })
    resolveCells = within(resolveRow).getAllByRole('cell')
    expect(resolveCells[1]).toHaveTextContent('模糊')
    expect(resolveCells[2]).toHaveTextContent('记得')
    expect(resolveRow).toHaveTextContent('2026-08-24')
    fireEvent.click(screen.getByRole('button', { name: '载入到期强化词' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(within(resolveRow).getByRole('button', { name: 'resolve 第3轮未到期' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'scheme 第1轮：忘记' })).toBeEnabled()
  })

  it.each([
    ['a missing review', () => ({})],
    ['a mismatched lesson word', () => reviewResponse({ lessonWordId: 'lesson-word-other' })],
    ['an out-of-range round', () => reviewResponse({ round: 6, roundCompleted: 6 })],
    ['a parseable noncanonical next review date', () => reviewResponse({ nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString() })],
    ['a result and grade mismatch', () => reviewResponse({ grade: 0 })],
  ])('rejects %s response without changing due count or row actionability', async (_case, responseFactory) => {
    const malformedResponse = responseFactory()
    const dueFirstRound = {
      ...lessonReviewQueue,
      lessons: [{
        ...lessonReviewQueue.lessons[0],
        words: [{
          ...lessonReviewQueue.lessons[0].words[0],
          lessonWordId: 'lesson-word-1',
          sortOrder: 1,
          wordId: 'word-1',
          meaningId: 'meaning-1',
          word: 'resolve',
          glossCn: '决意',
          definitionCn: '下定决心',
        }],
      }],
    }
    const unstartedLesson = {
      ...firstPassedLesson,
      reviewState: {
        words: firstPassedLesson.reviewState.words.map((word) => ({ ...word, roundCompleted: 0, nextReviewAt: null })),
        attempts: [],
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => dueFirstRound })
      .mockResolvedValueOnce({ ok: true, json: async () => malformedResponse })
    vi.stubGlobal('fetch', fetchMock)
    render(<StoryLessonShell lesson={unstartedLesson} progress={unstartedLesson.progress} dueWords={1} />)

    fireEvent.click(screen.getByRole('button', { name: '载入到期强化词' }))
    const action = await screen.findByRole('button', { name: 'resolve 第1轮：记得' })
    fireEvent.click(action)

    expect(await screen.findByRole('alert')).toHaveTextContent('未能保存 resolve 的第1轮复习')
    expect(screen.getByText(/本篇当前有 1 个词到期/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'resolve 第1轮：记得' })).toBeEnabled()
    const resolveRow = screen.getByRole('row', { name: /resolve/ })
    expect(within(resolveRow).getAllByRole('cell')[1].querySelector('span')).toBeNull()
  })

  it('accepts an immutable canonical historical schedule and matching grade before updating the row and due count', async () => {
    const dueFirstRound = {
      ...lessonReviewQueue,
      lessons: [{
        ...lessonReviewQueue.lessons[0],
        words: [{
          ...lessonReviewQueue.lessons[0].words[0],
          lessonWordId: 'lesson-word-1',
          sortOrder: 1,
          wordId: 'word-1',
          meaningId: 'meaning-1',
          word: 'resolve',
          glossCn: '决意',
          definitionCn: '下定决心',
        }],
      }],
    }
    const unstartedLesson = {
      ...firstPassedLesson,
      reviewState: {
        words: firstPassedLesson.reviewState.words.map((word) => ({ ...word, roundCompleted: 0, nextReviewAt: null })),
        attempts: [],
      },
    }
    const response = reviewResponse({ nextReviewAt: '2026-08-20T12:00:00.000Z' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => dueFirstRound })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    render(<StoryLessonShell lesson={unstartedLesson} progress={unstartedLesson.progress} dueWords={1} />)

    fireEvent.click(screen.getByRole('button', { name: '载入到期强化词' }))
    fireEvent.click(await screen.findByRole('button', { name: 'resolve 第1轮：记得' }))

    await waitFor(() => expect(screen.getByText(/本篇当前没有到期词/)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenLastCalledWith('/api/story/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ lessonWordId: 'lesson-word-1', round: 1, result: 'remembered' }),
    }))
    const resolveRow = screen.getByRole('row', { name: /resolve/ })
    expect(within(resolveRow).getAllByRole('cell')[1]).toHaveTextContent('记得')
    expect(within(resolveRow).getByRole('button', { name: 'resolve 第2轮未到期' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
  it('keeps a 100-word lesson in one compact ordered list', () => {
    const hundredWords: StoryLessonWordDto[] = Array.from({ length: 100 }, (_, index) => ({
      ...lesson.lessonWords[index % lesson.lessonWords.length],
      id: `lesson-word-${index + 1}`,
      sortOrder: index + 1,
      word: { id: `word-${index + 1}`, text: `target-${index + 1}`, phonetic: null },
    }))

    render(<StoryWordList lessonWords={hundredWords} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(100)
    expect(screen.getByText('target-100')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /显示 target-/ })).toHaveLength(100)
  })
})
