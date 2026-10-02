/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import UserManagementPanel from './UserManagementPanel'
import InteractionDashboard from '../interaction/InteractionDashboard'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ users: [], leaderboards: {}, challenge: null, messages: [], quizzes: [] })))

describe('management and interaction panels', () => {
  it('renders the account management controls', () => {
    render(<UserManagementPanel />)
    expect(screen.getByRole('heading', { name: '账号管理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建账号' })).toBeInTheDocument()
  })

  it('renders the interaction sections', () => {
    render(<InteractionDashboard />)
    expect(screen.getByRole('heading', { name: '学习互动' })).toBeInTheDocument()
    expect(screen.getByText('排行榜')).toBeInTheDocument()
  })
})



