/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import InteractionDashboard from './InteractionDashboard'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ leaderboards: {}, challenge: null })))

describe('interaction dashboard', () => {
  it('renders the dashboard heading and activity sections', () => {
    render(<InteractionDashboard />)
    expect(screen.getByRole('heading', { name: '学习互动' })).toBeInTheDocument()
    expect(screen.getByText('共同挑战')).toBeInTheDocument()
  })
})

