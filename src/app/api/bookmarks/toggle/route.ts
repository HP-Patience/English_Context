import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()
  const { wordId } = await req.json()

  if (!wordId) {
    return NextResponse.json({ error: 'wordId required' }, { status: 400 })
  }

  const uw = await prisma.userWord.findUnique({
    where: { userId_wordId: { userId, wordId } },
  })

  if (!uw) {
    return NextResponse.json({ error: 'Word not in your library' }, { status: 404 })
  }

  const updated = await prisma.userWord.update({
    where: { id: uw.id },
    data: { bookmarked: !uw.bookmarked },
  })

  return NextResponse.json({ bookmarked: updated.bookmarked })
}
