import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateSM2 } from '@/lib/sm2'

function calcMastery(ef: number): number {
  return Math.max(0, Math.min(100, Math.round(ef * 25)))
}

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 })
  }

  // Find next unlearned word in this group
  const items = await prisma.wordGroupItem.findMany({
    where: { wordGroupId: groupId },
    orderBy: { sortOrder: 'asc' },
    include: {
      word: {
        include: {
          meanings: {
            include: {
              userWordMeanings: {
                where: { userWord: { userId } },
              },
            },
          },
          userWords: {
            where: { userId },
          },
        },
      },
    },
  })

  // Find first word that has unlearned meanings
  for (const item of items) {
    for (const meaning of item.word.meanings) {
      const uwm = meaning.userWordMeanings[0]
      if (uwm && uwm.mastery === 0 && uwm.interval === 0) {
        // Get first sentence for this meaning
        const sentence = await prisma.generatedSentence.findFirst({
          where: { userWordMeaningId: uwm.id },
          orderBy: { lastUsedAt: 'desc' },
        })
        return NextResponse.json({
          id: uwm.id,
          wordId: item.word.id,
          word: item.word.text,
          bookmarked: item.word.userWords[0]?.bookmarked ?? false,
          pos: meaning.partOfSpeech,
          definitionCn: meaning.definitionCn,
          wordMastery: calcMastery(uwm.easeFactor),
          meaningMastery: uwm.mastery,
          sentence: sentence?.sentenceText || null,
          sentenceCn: sentence?.sentenceCn || null,
          groupId,
        })
      }
    }
  }

  // Check if all done in this group
  const totalItems = items.length
  const learnedItems = items.filter(item =>
    item.word.meanings.every(m =>
      m.userWordMeanings[0]?.mastery > 0
    )
  ).length

  return NextResponse.json({
    done: true,
    groupId,
    total: totalItems,
    learned: learnedItems,
  })
}

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()
  const { userWordMeaningId, grade } = await req.json()

  if (!userWordMeaningId || grade === undefined) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const uwm = await prisma.userWordMeaning.findFirst({
    where: { id: userWordMeaningId, userWord: { userId } },
    include: { userWord: true },
  })
  if (!uwm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sm2 = calculateSM2(uwm.easeFactor, uwm.interval, grade)

  await prisma.userWordMeaning.update({
    where: { id: userWordMeaningId },
    data: {
      easeFactor: sm2.easeFactor,
      interval: sm2.interval,
      nextReviewAt: sm2.nextReviewAt,
    },
  })

  const newMastery = calcMastery(sm2.easeFactor)
  await prisma.userWordMeaning.update({
    where: { id: userWordMeaningId },
    data: { mastery: newMastery },
  })

  // Recalc word-level mastery
  const allUwms = await prisma.userWordMeaning.findMany({
    where: { userWordId: uwm.userWordId },
  })
  const avgMastery = Math.round(
    allUwms.reduce((s, m) => s + m.mastery, 0) / allUwms.length
  )
  await prisma.userWord.update({
    where: { id: uwm.userWordId },
    data: { mastery: avgMastery },
  })

  // Log review
  const session = await prisma.reviewSession.create({
    data: { userId, endedAt: new Date() },
  })
  await prisma.reviewLog.create({
    data: {
      reviewSessionId: session.id,
      userWordMeaningId,
      sentenceText: '',
      testLevel: 1,
      result: grade >= 3 ? 'pass' : 'fail',
    },
  })

  return NextResponse.json({ grade, newMastery, wordMastery: avgMastery })
}
