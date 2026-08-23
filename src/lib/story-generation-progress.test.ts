import { describe, expect, it } from 'vitest'

import { emptyStoryGenerationProgress, normalizeStoryGenerationProgress } from './story-generation-progress'

describe('story generation progress normalization', () => {
  it('normalizes live snapshot fields used by the UI widget', () => {
    const progress = normalizeStoryGenerationProgress({
      status: 'in_progress',
      statusText: '正在生成第 7 篇',
      currentLessonOrder: 7,
      completedLessonCount: 6,
      totalLessons: 80,
      elapsedSeconds: 90,
      remainingSeconds: 180,
      updatedAt: '2026-08-23T00:00:00.000Z',
    })

    expect(progress).toMatchObject({
      available: true,
      status: 'running',
      statusText: '正在生成第 7 篇',
      currentLesson: 7,
      completedLessons: 6,
      totalLessons: 80,
      percent: 8,
      elapsedMs: 90000,
      etaMs: 180000,
    })
  })

  it('treats a completed generation report as completed progress', () => {
    const progress = normalizeStoryGenerationProgress({
      generatedAt: '2026-08-22T05:11:37.002Z',
      lessonCount: 80,
      generatedLessonCount: 80,
      courseId: 'course-1',
      courseVersion: 1,
    }, { source: 'report' })

    expect(progress.status).toBe('completed')
    expect(progress.percent).toBe(100)
    expect(progress.completedLessons).toBe(80)
    expect(progress.statusText).toBe('故事课程生成已完成。')
  })

  it('returns an idle shape for missing snapshots', () => {
    expect(emptyStoryGenerationProgress()).toMatchObject({
      available: false,
      status: 'idle',
      source: 'missing',
      statusText: '尚未发现故事生成进度快照。',
    })
  })
})
