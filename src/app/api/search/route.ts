import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] })
  }

  // Search by word text (prefix match > substring) or Chinese definition
  const words = await prisma.word.findMany({
    where: {
      language: 'en',
      OR: [
        { text: { startsWith: q } },
        { text: { contains: q } },
        {
          meanings: {
            some: { definitionCn: { contains: q } },
          },
        },
      ],
    },
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
        take: 3, // Limit meanings to avoid huge payload
      },
      userWords: {
        where: { userId },
      },
    },
    take: 20,
    orderBy: [
      { text: 'asc' },
    ],
  })

  return NextResponse.json({ results: words })
}
