import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getLocalUserId()

  const group = await prisma.wordGroup.findUnique({
    where: { id },
    select: { id: true, name: true },
  })
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const items = await prisma.wordGroupItem.findMany({
    where: { wordGroupId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      word: {
        include: {
          meanings: {
            // Keep the list preview aligned with the word detail page: ignore
            // orphaned/bad meanings that have neither an example nor a usable
            // generated sentence. Those rows can exist after sentence cleanup.
            where: {
              OR: [
                { example: { not: null } },
                {
                  generatedSentences: {
                    some: { source: { not: 'synonym_test' } },
                  },
                },
              ],
            },
            orderBy: { id: 'asc' },
            take: 1,
          },
          userWords: {
            where: { userId },
          },
        },
      },
    },
  })

  const words = items.flatMap((item) => {
    const firstMeaning = item.word.meanings[0]
    if (!firstMeaning) return []
    const uw = item.word.userWords[0]
    return [{
      id: item.word.id,
      text: item.word.text,
      pos: firstMeaning.partOfSpeech,
      definitionCn: firstMeaning.definitionCn ?? '',
      mastery: uw?.mastery ?? 0,
      status: uw?.status ?? 'learning',
      bookmarked: uw?.bookmarked ?? false,
    }]
  })

  return NextResponse.json({ group, words })
}
