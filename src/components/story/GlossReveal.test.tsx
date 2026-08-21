/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GlossReveal } from './GlossReveal'

afterEach(cleanup)

describe('GlossReveal', () => {
  it('temporarily reveals on hover and pins on click until a second click', () => {
    const onTogglePinned = vi.fn()
    render(<GlossReveal gloss="决意" hidden onTogglePinned={onTogglePinned} />)

    const control = screen.getByRole('button', { name: '显示并固定释义' })
    expect(screen.queryByText('决意')).not.toBeInTheDocument()
    expect(control).toHaveAttribute('aria-expanded', 'false')
    expect(control).toHaveAttribute('aria-pressed', 'false')

    fireEvent.mouseEnter(control)
    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(control).toHaveAttribute('aria-expanded', 'true')
    expect(control).toHaveAttribute('aria-pressed', 'false')

    fireEvent.mouseLeave(control)
    expect(screen.queryByText('决意')).not.toBeInTheDocument()

    fireEvent.click(control)
    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(control).toHaveAccessibleName('隐藏并取消固定释义')
    expect(control).toHaveAttribute('aria-expanded', 'true')
    expect(control).toHaveAttribute('aria-pressed', 'true')
    expect(onTogglePinned).toHaveBeenLastCalledWith(true)

    fireEvent.mouseLeave(control)
    expect(screen.getByText('决意')).toBeInTheDocument()

    fireEvent.mouseEnter(control)
    fireEvent.click(control)
    expect(screen.queryByText('决意')).not.toBeInTheDocument()
    expect(control).toHaveAccessibleName('显示并固定释义')
    expect(control).toHaveAttribute('aria-expanded', 'false')
    expect(control).toHaveAttribute('aria-pressed', 'false')
    expect(onTogglePinned).toHaveBeenLastCalledWith(false)
  })

  it('uses focus as a temporary reveal and keeps a pinned gloss visible after blur', () => {
    render(<GlossReveal gloss="谋划" hidden />)
    const control = screen.getByRole('button', { name: '显示并固定释义' })

    fireEvent.focus(control)
    expect(screen.getByText('谋划')).toBeInTheDocument()
    expect(control).toHaveAttribute('aria-pressed', 'false')

    fireEvent.blur(control)
    expect(screen.queryByText('谋划')).not.toBeInTheDocument()

    fireEvent.click(control)
    fireEvent.blur(control)
    expect(screen.getByText('谋划')).toBeInTheDocument()
    expect(control).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('uses native %s activation for exactly one pin toggle per gesture', async (_label, keys) => {
    const user = userEvent.setup()
    const onTogglePinned = vi.fn()
    render(<GlossReveal gloss="决意" hidden onTogglePinned={onTogglePinned} />)
    const control = screen.getByRole('button', { name: '显示并固定释义' })

    control.focus()
    await user.keyboard(keys)

    expect(control).toHaveAttribute('aria-pressed', 'true')
    expect(onTogglePinned).toHaveBeenCalledTimes(1)
    expect(onTogglePinned).toHaveBeenLastCalledWith(true)

    await user.keyboard(keys)
    control.blur()

    expect(screen.queryByText('决意')).not.toBeInTheDocument()
    expect(control).toHaveAttribute('aria-pressed', 'false')
    expect(onTogglePinned).toHaveBeenCalledTimes(2)
    expect(onTogglePinned).toHaveBeenLastCalledWith(false)
  })

  it('uses each touch pointer gesture as exactly one direct pin toggle', async () => {
    const user = userEvent.setup()
    const onTogglePinned = vi.fn()
    render(<GlossReveal gloss="决意" hidden onTogglePinned={onTogglePinned} />)
    const control = screen.getByRole('button', { name: '显示并固定释义' })

    await user.pointer({ keys: '[TouchA]', target: control })

    expect(screen.getByText('决意')).toBeInTheDocument()
    expect(control).toHaveAttribute('aria-pressed', 'true')
    expect(onTogglePinned).toHaveBeenCalledTimes(1)
    expect(onTogglePinned).toHaveBeenLastCalledWith(true)

    await user.pointer({ keys: '[TouchA]', target: control })

    expect(screen.queryByText('决意')).not.toBeInTheDocument()
    expect(control).toHaveAttribute('aria-pressed', 'false')
    expect(onTogglePinned).toHaveBeenCalledTimes(2)
    expect(onTogglePinned).toHaveBeenLastCalledWith(false)
  })
})
