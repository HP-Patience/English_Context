/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StoryStepNav } from './StoryStepNav'

afterEach(cleanup)

describe('StoryStepNav', () => {
  it('exposes the current step for CSS while preserving step semantics across rerenders', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <StoryStepNav currentStep={1} completedStep={2} onSelect={onSelect} />,
    )
    const stepList = screen.getByRole('list')
    expect(screen.queryByText('第一步 · 已成')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第一步/ }).querySelector('svg')).not.toBeNull()

    expect(stepList).toHaveAttribute('data-current-step', '1')
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'step'))
      .toEqual([screen.getByRole('button', { name: /第一步/ })])
    expect(screen.getByRole('button', { name: /第一步/ })).toHaveAttribute('data-completed', 'true')
    expect(screen.getByRole('button', { name: /第二步/ })).toHaveAttribute('data-completed', 'true')

    rerender(<StoryStepNav currentStep={2} completedStep={2} onSelect={onSelect} />)

    expect(stepList).toHaveAttribute('data-current-step', '2')
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'step'))
      .toEqual([screen.getByRole('button', { name: /第二步/ })])
    expect(screen.getByRole('button', { name: /第一步/ })).toHaveAttribute('data-completed', 'true')
    expect(screen.getByRole('button', { name: /第二步/ })).toHaveAttribute('data-completed', 'true')

    rerender(<StoryStepNav currentStep={3} completedStep={2} onSelect={onSelect} />)

    expect(stepList).toHaveAttribute('data-current-step', '3')
    expect(screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'step'))
      .toEqual([screen.getByRole('button', { name: /第三步/ })])
    expect(screen.getByRole('button', { name: /第一步/ })).toHaveAttribute('data-completed', 'true')
    expect(screen.getByRole('button', { name: /第二步/ })).toHaveAttribute('data-completed', 'true')
  })

  it('calls onSelect with the clicked step', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StoryStepNav currentStep={1} completedStep={0} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /第三步/ }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})
