import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getLocalUserId: vi.fn(),
  listLessonCompletions: vi.fn(),
  recordLessonCompletion: vi.fn(),
  listStepCompletions: vi.fn(),
  recordStepCompletion: vi.fn(),
  listParagraphCompletions: vi.fn(),
  recordParagraphCompletion: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { mocked: true }, getLocalUserId: mocks.getLocalUserId }))
vi.mock('@/lib/story-completion', () => ({
  listLessonCompletions: mocks.listLessonCompletions,
  recordLessonCompletion: mocks.recordLessonCompletion,
  listStepCompletions: mocks.listStepCompletions,
  recordStepCompletion: mocks.recordStepCompletion,
  listParagraphCompletions: mocks.listParagraphCompletions,
  recordParagraphCompletion: mocks.recordParagraphCompletion,
}))

import { GET as getLessonHistory, POST as postLessonCompletion } from '../app/api/story/lessons/[id]/completions/route'
import { GET as getStepHistory } from '../app/api/story/lessons/[id]/steps/[step]/completions/route'
import { POST as postParagraphCompletion } from '../app/api/story/lessons/[id]/paragraphs/[paragraphIndex]/completions/route'

const completion = {
  id: 'event-1',
  completionId: 'client-1',
  date: '2026-09-01',
  createdAt: '2026-09-02T00:00:00.000Z',
}

function request(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalUserId.mockResolvedValue('user-1')
  mocks.listLessonCompletions.mockResolvedValue([completion])
  mocks.recordLessonCompletion.mockResolvedValue(completion)
  mocks.listStepCompletions.mockResolvedValue([completion])
  mocks.recordParagraphCompletion.mockResolvedValue(completion)
})

describe('story completion history routes', () => {
  it('returns a user-scoped lesson completion history', async () => {
    const response = await getLessonHistory(
      new NextRequest('http://localhost/api/story/lessons/lesson-1/completions'),
      { params: Promise.resolve({ id: 'lesson-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ completions: [completion] })
    expect(mocks.listLessonCompletions).toHaveBeenCalledWith({
      prisma: { mocked: true }, userId: 'user-1', lessonId: 'lesson-1',
    })
  })

  it('passes a normalized Step 3 history request to the service', async () => {
    const response = await getStepHistory(
      new NextRequest('http://localhost/api/story/lessons/lesson-1/steps/3/completions'),
      { params: Promise.resolve({ id: 'lesson-1', step: '3' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.listStepCompletions).toHaveBeenCalledWith({
      prisma: { mocked: true }, userId: 'user-1', lessonId: 'lesson-1', step: 3,
    })
  })

  it('records zero-based paragraph completion with an exact calendar date', async () => {
    const response = await postParagraphCompletion(
      request('http://localhost/api/story/lessons/lesson-1/paragraphs/0/completions', {
        completionId: ' client-1 ', date: '2026-09-01',
      }),
      { params: Promise.resolve({ id: 'lesson-1', paragraphIndex: '0' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ completion })
    expect(mocks.recordParagraphCompletion).toHaveBeenCalledWith({
      prisma: { mocked: true },
      userId: 'user-1',
      lessonId: 'lesson-1',
      paragraphIndex: 0,
      payload: { completionId: 'client-1', date: '2026-09-01' },
    })
  })

  it('rejects impossible dates before calling persistence', async () => {
    const response = await postLessonCompletion(
      request('http://localhost/api/story/lessons/lesson-1/completions', {
        completionId: 'client-1', date: '2026-02-29',
      }),
      { params: Promise.resolve({ id: 'lesson-1' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.recordLessonCompletion).not.toHaveBeenCalled()
  })
})
