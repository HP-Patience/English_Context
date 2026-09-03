import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { listStoryCardBookmarks } from '@/lib/story-bookmarks'

export async function GET() {
  const userId = await getLocalUserId()

  const words = await prisma.userWord.findMany({
    where: { userId, bookmarked: true },
    include: {
      word: {
        include: {
          meanings: {
            include: {
              userWordMeanings: {
                where: { userWord: { userId } },
                include: {
                  sentences: {
                    take: 1,
                    orderBy: { lastUsedAt: 'desc' },
                  },
                },
              },
            },
            take: 2,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  const storyCards = await listStoryCardBookmarks({ prisma, userId })
  const wordBookmarks = words
    .filter((entry) => entry.word.meanings.length > 0)
    .map((entry) => ({ type: 'word' as const, ...entry }))
  const bookmarks = [...wordBookmarks, ...storyCards].sort((left, right) => {
    const byCreatedAt = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    return byCreatedAt || left.id.localeCompare(right.id)
  })

  return NextResponse.json({ bookmarks })
}
