/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ThemeToggle from './ThemeToggle'

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  vi.unstubAllGlobals()
})

describe('ThemeToggle', () => {
  it('applies the stored theme without rendering an executable script', async () => {
    localStorage.setItem('theme', 'dark')
    const { container } = render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    expect(container.querySelector('script')).toBeNull()
  })
})
