import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import { getWordData, generateSentences } from '@/lib/llm'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()

  const { word, interests } = await req.json()
  if (!word || typeof word !== 'string') {
    return NextResponse.json({ error: 'Word required' }, { status: 400 })
  }

  const text = word.toLowerCase().trim()
  let wordRecord = await prisma.word.findFirst({
    where: { text, language: 'en' },
  })
  if (!wordRecord) {
    wordRecord = await prisma.word.create({ data: { text, language: 'en' } })
  }

  const existing = await prisma.userWord.findUnique({
    where: { userId_wordId: { userId, wordId: wordRecord.id } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Word already added' }, { status: 409 })
  }

  const meaningsData = await getWordData(word)
  const meaningRecords = await Promise.all(
    meaningsData.map((m: { partOfSpeech: string; definition: string; definitionCn?: string }) =>
      prisma.meaning.create({
        data: { wordId: wordRecord!.id, partOfSpeech: m.partOfSpeech, definition: m.definition, definitionCn: m.definitionCn ?? null },
      })
    )
  )

  const userWord = await prisma.userWord.create({
    data: {
      userId,
      wordId: wordRecord.id,
      meanings: {
        create: meaningRecords.map((m) => ({ meaningId: m.id })),
      },
    },
    include: { meanings: true },
  })

  const uwmIds = userWord.meanings.map((uwm) => uwm.id)
  generateSentences(word, meaningRecords, interests ?? [], uwmIds).catch(console.error)

  return NextResponse.json({
    wordId: wordRecord.id,
    userWordId: userWord.id,
    meanings: meaningRecords.map((m) => ({ id: m.id, partOfSpeech: m.partOfSpeech, definition: m.definition })),
    userWordMeaningIds: uwmIds,
    status: 'generating',
  })
}

export async function GET(req: NextRequest) {
  const userId = await getLocalUserId()

  const { searchParams } = new URL(req.url)
  const uwmId = searchParams.get('userWordMeaningId')

  if (uwmId) {
    const sentences = await prisma.generatedSentence.findMany({
      where: { userWordMeaningId: uwmId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ ready: sentences.length > 0, sentences })
  }

  const words = await prisma.userWord.findMany({
    where: { userId },
    include: {
      word: true,
      meanings: { include: { meaning: true, sentences: { take: 1, orderBy: { createdAt: 'desc' } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(words)
}
