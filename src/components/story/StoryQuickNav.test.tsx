/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoryQuickNav } from './StoryQuickNav'

afterEach(cleanup)

describe('StoryQuickNav', () => {
  it('can collapse and reopen without switching the step', async () => {
    const onSelect = vi.fn()
    const { container } = render(<StoryQuickNav currentStep={2} onSelect={onSelect} />)
    const panel = container.querySelector('details')!
    expect(panel).toHaveAttribute('open')
    const toggle = screen.getByLabelText('展开或收起快捷导航')
    expect(toggle).toHaveAttribute('title', '步骤 / 章节导航')
    await userEvent.click(toggle)
    expect(panel).not.toHaveAttribute('open')
    await userEvent.click(toggle)
    expect(panel).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows two labelled rows with icon-only controls and disables the first boundaries', () => {
    const onSelect = vi.fn()
    render(<StoryQuickNav currentStep={1} onSelect={onSelect} previousLessonId={null} nextLessonId="lesson-2" />)
    const nav = screen.getByRole('navigation', { name: '故事快捷导航' })
    expect(within(nav).getByText('步骤')).toBeInTheDocument()
    expect(within(nav).getByText('章节')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上一章' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '下一章' })).toHaveAttribute('href', '/story/lesson-2')
    const nextStep = screen.getByRole('button', { name: '下一步' })
    expect(nextStep).toHaveTextContent('')
    expect(nextStep.querySelector('svg')).not.toBeNull()
    fireEvent.click(nextStep)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('disables last boundaries while allowing the previous step and chapter', () => {
    const onSelect = vi.fn()
    render(<StoryQuickNav currentStep={3} onSelect={onSelect} previousLessonId="lesson/1" nextLessonId={null} />)
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一章' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '上一章' })).toHaveAttribute('href', '/story/lesson%2F1')
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
