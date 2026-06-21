import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()

  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const items = await prisma.userWordMeaning.findMany({
    where: {
      userWord: { userId },
      interval: { gt: 0 },
      mastery: { lt: 60 },
      OR: [
        { lastRatedAt: null },
        { lastRatedAt: { lte: oneDayAgo } },
      ],
    },
    include: {
      meaning: true,
      userWord: { include: { word: true } },
      sentences: {
        where: { source: { not: 'synonym_test' } },
        orderBy: { lastUsedAt: 'desc' },
        take: 3,
      },
    },
    orderBy: { mastery: 'asc' },
    take: 50,
  })

  const result = items.map((uwm) => ({
    id: uwm.id,
    mastery: Math.max(0, Math.min(100, Math.round(uwm.easeFactor * 25))),
    wordMastery: 0,
    meaning: {
      id: uwm.meaning.id,
      partOfSpeech: uwm.meaning.partOfSpeech,
      definition: uwm.meaning.definition,
      definitionCn: uwm.meaning.definitionCn,
    },
    userWord: {
      word: { text: uwm.userWord.word.text, id: uwm.userWord.word.id },
      bookmarked: uwm.userWord.bookmarked,
      wordId: uwm.userWord.wordId,
    },
    sentences: uwm.sentences,
  }))

  return NextResponse.json(result)
}
