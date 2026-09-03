import type { StoryCompletionEvent } from '@/lib/story-completion'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseCompletion(value: unknown): StoryCompletionEvent | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.completionId !== 'string' ||
    typeof value.date !== 'string' ||
    typeof value.createdAt !== 'string'
  ) return null
  return {
    id: value.id,
    completionId: value.completionId,
    date: value.date,
    createdAt: value.createdAt,
  }
}

export function parseCompletionHistory(value: unknown): readonly StoryCompletionEvent[] | null {
  if (!isRecord(value) || !Array.isArray(value.completions)) return null
  const parsed = value.completions.map(parseCompletion)
  return parsed.every((completion) => completion !== null) ? parsed : null
}

export function parseSavedCompletion(value: unknown): StoryCompletionEvent | null {
  return isRecord(value) ? parseCompletion(value.completion) : null
}
