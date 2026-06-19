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
                where: { source: { not: 'synonym_test' } },
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

  // Strip meanings with no content (hallucinated batch-ai leftovers)
  word.meanings = word.meanings.filter((m) => {
    const hasExample = m.example !== null
    const hasSentences = m.userWordMeanings.some(
      (uwm) => uwm.sentences.length > 0,
    )
    return hasExample || hasSentences
  })

  return NextResponse.json({ word })
}
