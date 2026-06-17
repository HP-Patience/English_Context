import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

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

  return NextResponse.json({ bookmarks: words })
}
