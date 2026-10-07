import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { searchCaseInsensitive: true } })
  const mode = user?.searchCaseInsensitive === false ? undefined : 'insensitive'

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] })
  }

  // Search by word text (prefix match > substring) or Chinese definition
  const words = await prisma.word.findMany({
    where: {
      language: 'en',
      OR: [
        { text: { startsWith: q, ...(mode ? { mode } : {}) } },
        { text: { contains: q, ...(mode ? { mode } : {}) } },
        {
          meanings: {
            some: { definitionCn: { contains: q, ...(mode ? { mode } : {}) } },
          },
        },
      ],
    },
    include: {
      groups: {
        include: { wordGroup: true },
        take: 1,
      },
      meanings: {
        include: {
          userWordMeanings: {
            where: { userWord: { userId } },
            include: {
              sentences: {
                where: { source: { not: 'synonym_test' } },
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

  return NextResponse.json({ results: words.filter((word) => word.meanings.length > 0) })
}
