import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const userId = await getLocalUserId()

  const word = await prisma.word.findUnique({
    where: { id },
    include: {
      meanings: {
        include: {
          userWordMeanings: {
            where: { userWord: { userId } },
            include: {
              sentences: {
                orderBy: { lastUsedAt: 'desc' },
              },
            },
          },
        },
      },
      userWords: {
        where: { userId },
      },
      groups: {
        include: { wordGroup: true },
        orderBy: { wordGroup: { sortOrder: 'asc' } },
      },
    },
  })

  if (!word) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 })
  }

  return NextResponse.json({ word })
}
