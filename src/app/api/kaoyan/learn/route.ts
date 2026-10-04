import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { calculateSM2 } from '@/lib/sm2'

function calcMastery(ef: number): number {
  return Math.max(0, Math.min(100, Math.round(ef * 25)))
}

async function nextUnlearnedWord(userId: string, groupId: string | null = null) {
  const unlearned = { OR: [
    { userWordMeanings: { none: { userWord: { userId } } } },
    { userWordMeanings: { some: { userWord: { userId }, mastery: 0, interval: 0 } } },
  ] }
  const item = await prisma.wordGroupItem.findFirst({
    where: { ...(groupId ? { wordGroupId: groupId } : {}), word: { meanings: { some: unlearned } } },
    orderBy: [{ wordGroup: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: { word: { include: {
      meanings: { where: unlearned, orderBy: { id: 'asc' }, include: { userWordMeanings: { where: { userWord: { userId }, mastery: 0, interval: 0 }, orderBy: { id: 'asc' } } } },
      userWords: { where: { userId } },
    } } },
  })
  if (!item) {
    if (!groupId) return NextResponse.json({ done: true }, { headers: { 'Cache-Control': 'no-store' } })
    const items = await prisma.wordGroupItem.findMany({
      where: { wordGroupId: groupId },
      include: { word: { include: { meanings: { include: { userWordMeanings: { where: { userWord: { userId } } } } } } } },
    })
    const learnable = items.filter(entry => entry.word.meanings.length > 0)
    const learned = learnable.filter(entry => entry.word.meanings.every(meaning => meaning.userWordMeanings[0]?.mastery > 0)).length
    return NextResponse.json({ done: true, groupId, total: learnable.length, learned }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const meaning = item.word.meanings[0]
  const progress = meaning.userWordMeanings[0]
  const sentence = progress ? await prisma.generatedSentence.findFirst({ where: { userWordMeaningId: progress.id }, orderBy: { lastUsedAt: 'desc' } }) : null
  return NextResponse.json({
    id: progress?.id ?? null, meaningId: meaning.id,
    wordId: item.word.id, word: item.word.text, bookmarked: item.word.userWords[0]?.bookmarked ?? false,
    pos: meaning.partOfSpeech, definition: meaning.definition, definitionCn: meaning.definitionCn,
    wordMastery: item.word.userWords[0]?.mastery ?? 0, meaningMastery: progress?.mastery ?? 0,
    groupId: item.wordGroupId, sentence: sentence?.sentenceText ?? meaning.example ?? null, sentenceCn: sentence?.sentenceCn ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')
  const roundParam = searchParams.get('round')
  const round = roundParam ? parseInt(roundParam, 10) : 0

  if (!groupId || !(round >= 1)) {
    return nextUnlearnedWord(userId, groupId)
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

  const learnableItems = items.filter((item) => item.word.meanings.length > 0)

  // Round N: show words where learnRound >= round, unrated first
  const roundItems = learnableItems.filter(item => {
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

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()
  const { userWordMeaningId: requestedId, meaningId, grade, flippedToForgot } = await req.json()
  if (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 0 || grade > 5 || (!requestedId && typeof meaningId !== 'string') || (requestedId && typeof requestedId !== 'string')) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
  let userWordMeaningId = requestedId
  if (!userWordMeaningId) {
    const meaning = await prisma.meaning.findUnique({ where: { id: meaningId }, select: { id: true, wordId: true } })
    if (!meaning) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const progress = await prisma.$transaction(async tx => {
      // Updating the same wordId locks this user's row, preventing duplicate first-meaning records.
      const userWord = await tx.userWord.upsert({
        where: { userId_wordId: { userId, wordId: meaning.wordId } },
        create: { userId, wordId: meaning.wordId }, update: { wordId: meaning.wordId },
      })
      const existing = await tx.userWordMeaning.findFirst({ where: { userWordId: userWord.id, meaningId } })
      return existing ?? tx.userWordMeaning.create({ data: { userWordId: userWord.id, meaningId } })
    })
    userWordMeaningId = progress.id
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
