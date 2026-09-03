import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { parseBookmarkStatePayload } from '@/lib/bookmark-api-types'
import { setStoryCardBookmark } from '@/lib/story-bookmarks'
import { classifyStoryApiError } from '@/lib/story-api-types'

export async function POST(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const payload = parseBookmarkStatePayload(await req.json())

    if (!payload) {
      return NextResponse.json({ error: 'Invalid bookmark payload' }, { status: 400 })
    }
    if (payload.type === 'storyCard') {
      const result = await setStoryCardBookmark({
        prisma,
        userId,
        lessonId: payload.lessonId,
        paragraphIndex: payload.paragraphIndex,
        bookmarked: payload.bookmarked,
      })
      return NextResponse.json({ type: 'storyCard', ...result })
    }

    const result = await prisma.userWord.updateMany({
      where: { userId, wordId: payload.wordId },
      data: { bookmarked: payload.bookmarked },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Word not in your library' }, { status: 404 })
    }

    return NextResponse.json({ type: 'word', bookmarked: payload.bookmarked })
  } catch (error) {
    const status = classifyStoryApiError(error)
    if (status === 404) return NextResponse.json({ error: 'Story card not found' }, { status })
    console.error('bookmark toggle error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
