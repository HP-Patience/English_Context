import type { StoryCompletionEvent } from './story-completion'
import type { StoryFirstPassStep } from './story-progress'

export type StoryCompletionPayload = {
  readonly completionId: string
  readonly date: string
}

export type StoryCompletionUpdatePayload = {
  readonly id: string
  readonly date: string
}

export type StoryCompletionDeletePayload = {
  readonly id: string
}

export type StoryCompletionApiResponse = { readonly completion: StoryCompletionEvent }
export type StoryCompletionHistoryApiResponse = { readonly completions: readonly StoryCompletionEvent[] }
export type StoryParagraphStep = 1 | 2

const MAX_IDENTIFIER_LENGTH = 200

export function parseStoryCompletionPayload(value: unknown): StoryCompletionPayload | null {
  if (!isPlainObject(value) || !isValidIdentifier(value.completionId) || typeof value.date !== 'string') {
    return null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null
  return { completionId: value.completionId.trim(), date: value.date }
}

export function parseStoryCompletionUpdatePayload(value: unknown): StoryCompletionUpdatePayload | null {
  if (!isPlainObject(value) || !isValidIdentifier(value.id) || !isCalendarDate(value.date)) return null
  return { id: value.id.trim(), date: value.date }
}

export function parseStoryCompletionDeletePayload(value: unknown): StoryCompletionDeletePayload | null {
  if (!isPlainObject(value) || !isValidIdentifier(value.id)) return null
  return { id: value.id.trim() }
}

export function parseStoryFirstPassStep(value: string): StoryFirstPassStep | null {
  if (value === '1') return 1
  if (value === '2') return 2
  if (value === '3') return 3
  return null
}

export function parseStoryParagraphIndex(value: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseStoryParagraphStep(value: string | null): StoryParagraphStep | null {
  if (value === null || value === '1') return 1
  if (value === '2') return 2
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_IDENTIFIER_LENGTH
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}
