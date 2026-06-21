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
  const roundParam = searchParams.get('round')
  const round = roundParam ? parseInt(roundParam, 10) : 0

  if (!groupId) {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 })
  }

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

  if (round >= 1) {
    // Round N: show words where learnRound >= round, unrated first
    const roundItems = items.filter(item => {
      const uw = item.word.userWords[0]
      return uw && uw.learnRound >= round
    })

    // Count completed for this round
    const totalInRound = roundItems.length
    let completedCount = 0
    for (const item of roundItems) {
      const allUwms = item.word.meanings.flatMap(m => m.userWordMeanings)
      if (allUwms.length > 0 && allUwms.every(uwm => uwm.lastRatedAt !== null)) {
        completedCount++
      }
    }

    // Find first uncompleted word, ordered by lastRatedAt ASC NULLS FIRST
    const uncompleted = roundItems
      .filter(item => {
        const allUwms = item.word.meanings.flatMap(m => m.userWordMeanings)
        return allUwms.length > 0 && allUwms.some(uwm => uwm.lastRatedAt === null)
      })
      .sort((a, b) => {
        const aUwm = a.word.meanings.flatMap(m => m.userWordMeanings).find(uwm => uwm.lastRatedAt === null)
        const bUwm = b.word.meanings.flatMap(m => m.userWordMeanings).find(uwm => uwm.lastRatedAt === null)
        // Items with null lastRatedAt come first; then sort by sortOrder
        if (aUwm && !bUwm) return -1
        if (!aUwm && bUwm) return 1
        return a.sortOrder - b.sortOrder
      })

    if (uncompleted.length === 0) {
      return NextResponse.json({
        done: true,
        groupId,
        total: totalInRound,
        learned: completedCount,
        round,
      })
    }

    const target = uncompleted[0]
    const firstUwm = target.word.meanings.flatMap(m => m.userWordMeanings).find(uwm => uwm.lastRatedAt === null)
    const meaning = target.word.meanings.find(m => m.userWordMeanings.some(uwm => uwm.id === firstUwm?.id))

    if (!firstUwm || !meaning) {
      return NextResponse.json({ done: true, groupId, round })
    }

    const sentence = await prisma.generatedSentence.findFirst({
      where: { userWordMeaningId: firstUwm.id },
      orderBy: { lastUsedAt: 'desc' },
    })

    return NextResponse.json({
      id: firstUwm.id,
      wordId: target.word.id,
      word: target.word.text,
      bookmarked: target.word.userWords[0]?.bookmarked ?? false,
      pos: meaning.partOfSpeech,
      definitionCn: meaning.definitionCn,
      wordMastery: calcMastery(firstUwm.easeFactor),
      meaningMastery: firstUwm.mastery,
      groupId,
      round,
      roundProgress: { completed: completedCount, total: totalInRound },
      sentence: sentence?.sentenceText || null,
      sentenceCn: sentence?.sentenceCn || null,
    })
  }

  // Round 0 (default): current behavior — find unlearned meanings
  let foundUwmId: string | null = null
  let responseData: Record<string, unknown> | null = null

  for (const item of items) {
    for (const meaning of item.word.meanings) {
      const uwm = meaning.userWordMeanings[0]
      if (uwm && uwm.mastery === 0 && uwm.interval === 0) {
        foundUwmId = uwm.id
        responseData = {
          id: uwm.id,
          wordId: item.word.id,
          word: item.word.text,
          bookmarked: item.word.userWords[0]?.bookmarked ?? false,
          pos: meaning.partOfSpeech,
          definitionCn: meaning.definitionCn,
          wordMastery: calcMastery(uwm.easeFactor),
          meaningMastery: uwm.mastery,
          groupId,
        }
        break
      }
    }
    if (foundUwmId) break
  }

  if (responseData && foundUwmId) {
    const sentence = await prisma.generatedSentence.findFirst({
      where: { userWordMeaningId: foundUwmId },
      orderBy: { lastUsedAt: 'desc' },
    })
    return NextResponse.json({
      ...responseData,
      sentence: sentence?.sentenceText || null,
      sentenceCn: sentence?.sentenceCn || null,
    })
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
  const { userWordMeaningId, grade, flippedToForgot } = await req.json()

  if (!userWordMeaningId || grade === undefined) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const finalGrade = flippedToForgot ? 0 : Math.round(grade)

  const uwm = await prisma.userWordMeaning.findFirst({
    where: { id: userWordMeaningId, userWord: { userId } },
    include: { userWord: true },
  })
  if (!uwm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sm2 = calculateSM2(uwm.easeFactor, uwm.interval, finalGrade)

  await prisma.userWordMeaning.update({
    where: { id: userWordMeaningId },
    data: {
      easeFactor: sm2.easeFactor,
      interval: sm2.interval,
      nextReviewAt: sm2.nextReviewAt,
    },
  })

  const newMastery = calcMastery(sm2.easeFactor)
  const now = new Date()
  await prisma.userWordMeaning.update({
    where: { id: userWordMeaningId },
    data: { mastery: newMastery, lastRatedAt: now },
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
    data: { mastery: avgMastery, lastRatedAt: now },
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
      result: finalGrade >= 3 ? 'pass' : 'fail',
    },
  })

  if (!flippedToForgot) {
    // Upsert today's daily goal
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyTarget: true },
    })
    const goal = await prisma.dailyGoal.upsert({
      where: { userId_date: { userId, date: today } },
      update: { learned: { increment: 1 } },
      create: {
        userId,
        date: today,
        target: user?.dailyTarget ?? 30,
        learned: 1,
        reviewed: 0,
      },
    })
    if (goal.learned >= goal.target && !goal.completed) {
      await prisma.dailyGoal.update({
        where: { id: goal.id },
        data: { completed: true },
      })
    }
  }

  return NextResponse.json({ grade: finalGrade, newMastery, wordMastery: avgMastery })
}
