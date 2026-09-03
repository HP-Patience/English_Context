/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn().mockResolvedValue({ kind: 'missing' }),
  prepare: vi.fn().mockResolvedValue({ kind: 'ready', courseVersion: 9, lessonCount: 61 }),
}))

vi.mock('@/lib/story-offline-cache', () => ({
  getStoryOfflineStatus: mocks.getStatus,
  prepareStoryOffline: mocks.prepare,
}))

import { StoryOfflinePreparation } from './StoryOfflinePreparation'

describe('StoryOfflinePreparation', () => {
  it('reports ready only after explicit preparation completes', async () => {
    const user = userEvent.setup()
    render(<StoryOfflinePreparation />)

    expect(await screen.findByText('尚未准备离线故事')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '准备离线阅读' }))

    expect(mocks.prepare).toHaveBeenCalledOnce()
    expect(await screen.findByText('已准备 61 篇故事（课程版本 9）')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开离线阅读器' })).toHaveAttribute('href', '/story-offline.html')
  })
})
