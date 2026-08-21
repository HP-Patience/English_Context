/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cachedFetch: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: mocks.prefetch, push: mocks.push }),
}))

vi.mock('@/lib/api-cache', () => ({ cachedFetch: mocks.cachedFetch }))

import HomePage from '../../app/page'
import NavBar from '../NavBar'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  })
  mocks.cachedFetch.mockReset()
  mocks.cachedFetch.mockResolvedValue({ totalWords: 6098, groups: [], dueCount: 3 })
})

describe('story navigation entry points', () => {
  it('adds story mode to navigation without replacing review', () => {
    render(<NavBar />)

    expect(screen.getByRole('link', { name: '故事' })).toHaveAttribute('href', '/story')
    expect(screen.getByRole('link', { name: '复习' })).toHaveAttribute('href', '/review')
  })

  it('offers story learning as a separate home action while retaining review', async () => {
    render(<HomePage />)

    expect(await screen.findByRole('link', { name: '进入故事课程' })).toHaveAttribute('href', '/story')
    expect(screen.getByRole('button', { name: /复习/ })).toBeInTheDocument()
    expect(screen.getByText(/连续故事/)).toBeInTheDocument()
  })
})
