/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./CompletionDateHistory', () => ({
  CompletionDateHistory: () => <div>完成日期</div>,
}))

import { StoryCardDetail } from './StoryCardDetail'

afterEach(cleanup)

describe('StoryCardDetail', () => {
  it('initializes its paragraph bookmark control from lesson detail state', () => {
    render(
      <StoryCardDetail
        lessonId="lesson-1"
        lessonOrder={1}
        lessonTitle="青茅山醒来"
        paragraph={{ sceneTitle: '雨夜重生', segments: [{ type: 'text', value: '雨夜。' }] }}
        paragraphIndex={0}
        lessonWords={[]}
        completedCards={0}
        totalCards={1}
        initiallyBookmarked
      />,
    )

    expect(screen.getByRole('button', { name: '取消收藏第 1 段' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '取消收藏第 1 段' })).toHaveAttribute('title', '取消收藏第 1 段')
    expect(screen.getByRole('heading', { name: '雨夜重生', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '雨夜重生' })).not.toBeInTheDocument()
  })
})
