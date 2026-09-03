import { describe, expect, it, vi } from 'vitest'

import { loadStoryCompletionSummaries } from './story-completion-summary-query'

describe('loadStoryCompletionSummaries', () => {
  it('builds per-lesson summaries from grouped counts and latest dates', async () => {
    const lessonGroupBy = vi.fn().mockResolvedValue([
      { lessonId: 'lesson-1', _count: { _all: 2 }, _max: { completionDate: new Date('2026-08-20T00:00:00.000Z') } },
    ])
    const stepGroupBy = vi.fn().mockResolvedValue([
      { lessonId: 'lesson-1', _count: { _all: 4 }, _max: { completionDate: new Date('2026-08-19T00:00:00.000Z') } },
    ])
    const paragraphGroupBy = vi.fn().mockResolvedValue([
      { lessonId: 'lesson-1', paragraphIndex: 0, _count: { _all: 3 }, _max: { completionDate: new Date('2026-08-18T00:00:00.000Z') } },
      { lessonId: 'lesson-1', paragraphIndex: 2, _count: { _all: 1 }, _max: { completionDate: new Date('2026-08-21T00:00:00.000Z') } },
    ])
    const prisma = {
      userStoryLessonCompletion: { groupBy: lessonGroupBy },
      userStoryStepCompletion: { groupBy: stepGroupBy },
      userStoryParagraphCompletion: { groupBy: paragraphGroupBy },
    }

    const summaries = await loadStoryCompletionSummaries({
      prisma,
      userId: 'user-1',
      lessons: [
        { lessonId: 'lesson-1', totalCards: 5 },
        { lessonId: 'lesson-2', totalCards: 2 },
      ],
    })

    expect(summaries['lesson-1']).toEqual({
      lesson: { count: 2, latestDate: '2026-08-20' },
      step: { count: 4, latestDate: '2026-08-19' },
      paragraph: { count: 4, latestDate: '2026-08-21', completedCards: 2, totalCards: 5 },
    })
    expect(summaries['lesson-2']).toEqual({
      lesson: { count: 0, latestDate: null },
      step: { count: 0, latestDate: null },
      paragraph: { count: 0, latestDate: null, completedCards: 0, totalCards: 2 },
    })
    expect(lessonGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['lessonId'],
      where: { userId: 'user-1', lessonId: { in: ['lesson-1', 'lesson-2'] } },
      _count: { _all: true },
      _max: { completionDate: true },
    }))
    expect(paragraphGroupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['lessonId', 'paragraphIndex'] }))
  })
})
