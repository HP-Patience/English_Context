import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateSM2 } from '@/lib/sm2'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()

  const { userWordMeaningId, grade, sentenceText, flippedToForgot } = await req.json()
  if (!userWordMeaningId || grade === undefined) {
    return NextResponse.json({ error: 'Invalid review data' }, { status: 400 })
  }

  const uwm = await prisma.userWordMeaning.findFirst({
    where: { id: userWordMeaningId, userWord: { userId } },
  })
  if (!uwm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If user flipped from 清楚 to 不记得, override grade to 0
  const finalGrade = flippedToForgot ? 0 : Math.round(grade)
  const result = calculateSM2(uwm.easeFactor, uwm.interval, finalGrade)

  await prisma.userWordMeaning.update({
    where: { id: userWordMeaningId },
    data: {
      easeFactor: result.easeFactor,
      interval: result.interval,
      nextReviewAt: result.nextReviewAt,
    },
  })

  // Update mastery
  const gradeBonus = finalGrade >= 4 ? 10 : finalGrade >= 2 ? -5 : -15
  const newMastery = Math.max(0, Math.min(100, Math.round(result.easeFactor * 25 + gradeBonus)))
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

  if (result.interval >= 30) {
    await prisma.userWord.update({
      where: { id: uwm.userWordId },
      data: { status: 'mastered' },
    })
  }

  // Update lastUsedAt on the sentence used
  if (sentenceText) {
    await prisma.generatedSentence.updateMany({
      where: { userWordMeaningId, sentenceText },
      data: { lastUsedAt: new Date() },
    })
  }

  const session = await prisma.reviewSession.create({
    data: { userId, endedAt: new Date() },
  })

  await prisma.reviewLog.create({
    data: {
      reviewSessionId: session.id,
      userWordMeaningId,
      sentenceText: sentenceText || '',
      testLevel: 1,
      result: finalGrade >= 3 ? 'pass' : 'fail',
    },
  })

  return NextResponse.json({ finalGrade, easeFactor: result.easeFactor, nextReviewAt: result.nextReviewAt })
}
