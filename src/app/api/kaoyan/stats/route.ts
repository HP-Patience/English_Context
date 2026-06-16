import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()

  const totalWords = await prisma.userWord.count({ where: { userId } })
  const learnedCount = await prisma.userWord.count({
    where: { userId, mastery: { gt: 0 } },
  })
  const dueCount = await prisma.userWordMeaning.count({
    where: {
      userWord: { userId },
      nextReviewAt: { lte: new Date() },
      interval: { gt: 0 },
    },
  })

  // Group-level progress
  const groups = await prisma.wordGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        include: {
          word: {
            include: {
              userWords: { where: { userId } },
            },
          },
        },
      },
    },
  })

  const groupProgress = groups.map((g) => {
    const total = g.words.length
    const learned = g.words.filter(
      (gi) => gi.word.userWords[0]?.mastery > 0
    ).length
    return {
      id: g.id,
      name: g.name,
      total,
      learned,
    }
  })

  return NextResponse.json({
    totalWords,
    learnedCount,
    dueCount,
    groups: groupProgress,
  })
}
