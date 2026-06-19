import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()

  const due = await prisma.userWordMeaning.findMany({
    where: {
      userWord: { userId },
      nextReviewAt: { lte: new Date() },
      interval: { gt: 0 },
    },
    include: {
      meaning: true,
      userWord: { include: { word: true } },
      sentences: { where: { source: { not: 'synonym_test' } }, orderBy: { lastUsedAt: 'desc' }, take: 3 },
    },
    orderBy: { nextReviewAt: 'asc' },
    take: 50,
  })

  const items = due.map((uwm) => ({
    id: uwm.id,
    mastery: Math.max(0, Math.min(100, Math.round(uwm.easeFactor * 25))),
    wordMastery: 0, // computed on frontend if needed
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

  return NextResponse.json(items)
}
