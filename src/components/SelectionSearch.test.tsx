/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

import SelectionSearch from './SelectionSearch'

afterEach(() => {
  cleanup()
  mocks.push.mockReset()
  window.getSelection()?.removeAllRanges()
})

function selectContents(element: HTMLElement): void {
  const selection = window.getSelection()
  if (selection === null) {
    throw new TypeError('Selection API is unavailable in the test environment')
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  Object.defineProperty(range, 'getBoundingClientRect', {
    value: () => new DOMRect(20, 30, 80, 18),
  })
  selection.removeAllRanges()
  selection.addRange(range)
  fireEvent(document, new Event('selectionchange'))
}

function collapseSelection(element: HTMLElement): void {
  const selection = window.getSelection()
  if (selection === null) {
    throw new TypeError('Selection API is unavailable in the test environment')
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  fireEvent(document, new Event('selectionchange'))
}

function dispatchContextMenu(target: Element): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function renderSelectionFixture() {
  return render(
    <>
      <SelectionSearch className="reader-copy">
        <p>selectable phrase</p>
        <p>another phrase</p>
        <a href="/destination">destination</a>
        <button type="button">action</button>
        <input aria-label="query" defaultValue="editable" />
      </SelectionSearch>
      <p>outside phrase</p>
    </>,
  )
}

describe('SelectionSearch', () => {
  it('prevents the native context menu for selected non-interactive content inside the wrapper', () => {
    renderSelectionFixture()
    const content = screen.getByText('selectable phrase')
    selectContents(content)

    const contextMenu = dispatchContextMenu(content)

    expect(contextMenu.defaultPrevented).toBe(true)
  })

  it.each([
    ['link', () => screen.getByRole('link', { name: 'destination' })],
    ['button', () => screen.getByRole('button', { name: 'action' })],
    ['input', () => screen.getByRole('textbox', { name: 'query' })],
  ])('keeps the native context menu for the %s inside the wrapper', (_name, getControl) => {
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))

    const contextMenu = dispatchContextMenu(getControl())

    expect(contextMenu.defaultPrevented).toBe(false)
  })

  it('keeps the native context menu when there is no active selection', () => {
    renderSelectionFixture()

    const contextMenu = dispatchContextMenu(screen.getByText('selectable phrase'))

    expect(contextMenu.defaultPrevented).toBe(false)
  })

  it('keeps the native context menu for unselected non-interactive content', () => {
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))

    const contextMenu = dispatchContextMenu(screen.getByText('another phrase'))

    expect(contextMenu.defaultPrevented).toBe(false)
  })

  it('routes the selected text through keyboard activation of the accessible search button', async () => {
    const user = userEvent.setup()
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))
    const searchButton = screen.getByRole('button', { name: '搜索' })
    searchButton.focus()

    await user.keyboard('{Enter}')

    expect(mocks.push).toHaveBeenCalledWith('/search?q=selectable%20phrase')
  })

  it('dismisses the search action on an outside pointer interaction', () => {
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))

    fireEvent.mouseDown(screen.getByText('outside phrase'))

    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
  })

  it('dismisses the search action on scroll', () => {
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))

    fireEvent.scroll(window)

    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
  })

  it('dismisses the search action with Escape without affecting focused controls', () => {
    renderSelectionFixture()
    const input = screen.getByRole('textbox', { name: 'query' })
    input.focus()
    selectContents(screen.getByText('selectable phrase'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('dismisses the search action when the selection collapses', () => {
    renderSelectionFixture()
    const content = screen.getByText('selectable phrase')
    selectContents(content)

    collapseSelection(content)

    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
  })

  it('dismisses the search action when selection moves outside the wrapper', () => {
    renderSelectionFixture()
    selectContents(screen.getByText('selectable phrase'))

    selectContents(screen.getByText('outside phrase'))

    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument()
  })

  it('marks only its container for scoped touch-callout suppression', () => {
    const { container } = renderSelectionFixture()

    expect(container.querySelector('.reader-copy')).toHaveClass('selection-search')
  })
})
