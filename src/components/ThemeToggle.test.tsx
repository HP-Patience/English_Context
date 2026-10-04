/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('morphicons/react', () => ({
  MorphIcon: ({ icon, reducedMotion, size }: { icon: string; reducedMotion: string; size: number }) => <svg data-icon={icon} data-reduced-motion={reducedMotion} width={size} />,
}))
import ThemeToggle from './ThemeToggle'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  vi.unstubAllGlobals()
})

describe('ThemeToggle', () => {
  it('morphs the icon while persisting the theme and honoring reduced motion', async () => {
    const { container } = render(<ThemeToggle />)
    const toggle = await screen.findByRole('button', { name: '切换到暗色模式' })
    const icon = container.querySelector('svg')!
    expect(icon).toHaveAttribute('data-reduced-motion', 'user')
    expect(icon).toHaveAttribute('width', '20')
    const initial = icon.getAttribute('data-icon')
    fireEvent.click(toggle)
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(container.querySelector('svg')?.getAttribute('data-icon')).not.toBe(initial)
    fireEvent.click(screen.getByRole('button', { name: '切换到亮色模式' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe(initial)
  })
  it('applies the stored theme without rendering an executable script', async () => {
    localStorage.setItem('theme', 'dark')
    const { container } = render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    expect(container.querySelector('script')).toBeNull()
  })
})
