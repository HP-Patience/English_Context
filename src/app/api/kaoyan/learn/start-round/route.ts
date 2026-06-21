import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()
  const { groupId } = await req.json()

  if (!groupId) {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 })
  }

  // Find current max round for this group
  const groupItems = await prisma.wordGroupItem.findMany({
    where: { wordGroupId: groupId },
    include: {
      word: {
        include: {
          userWords: { where: { userId } },
        },
      },
    },
  })

  const existingRounds = groupItems
    .map(item => item.word.userWords[0]?.learnRound ?? 0)
  const maxRound = Math.max(0, ...existingRounds)
  const newRound = maxRound + 1

  // Increment learnRound for all UserWords in this group
  const userWordIds = groupItems
    .map(item => item.word.userWords[0]?.id)
    .filter(Boolean)

  if (userWordIds.length > 0) {
    await prisma.userWord.updateMany({
      where: { id: { in: userWordIds as string[] } },
      data: { learnRound: newRound, lastRatedAt: null },
    })
  }

  return NextResponse.json({ round: newRound, wordCount: userWordIds.length })
}
