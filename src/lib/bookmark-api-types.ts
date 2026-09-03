export type BookmarkStatePayload =
  | { readonly type: 'word'; readonly wordId: string; readonly bookmarked: boolean }
  | { readonly type: 'storyCard'; readonly lessonId: string; readonly paragraphIndex: number; readonly bookmarked: boolean }

const MAX_IDENTIFIER_LENGTH = 200

export function parseBookmarkStatePayload(value: unknown): BookmarkStatePayload | null {
  if (!isRecord(value)) return null
  if (value.type === 'word' && isIdentifier(value.wordId) && typeof value.bookmarked === 'boolean') {
    return { type: 'word', wordId: value.wordId.trim(), bookmarked: value.bookmarked }
  }
  if (
    value.type === 'storyCard' &&
    isIdentifier(value.lessonId) &&
    typeof value.paragraphIndex === 'number' &&
    Number.isSafeInteger(value.paragraphIndex) &&
    value.paragraphIndex >= 0 &&
    typeof value.bookmarked === 'boolean'
  ) {
    return {
      type: 'storyCard',
      lessonId: value.lessonId.trim(),
      paragraphIndex: value.paragraphIndex,
      bookmarked: value.bookmarked,
    }
  }
  return null
}

export function parseBookmarkStateResponse(value: unknown): boolean | null {
  return isRecord(value) && typeof value.bookmarked === 'boolean' ? value.bookmarked : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_IDENTIFIER_LENGTH
}
