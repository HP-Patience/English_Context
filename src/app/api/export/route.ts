import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupIds = searchParams.getAll('groupId')

  if (!groupIds.length) {
    return NextResponse.json({ error: 'At least one groupId required' }, { status: 400 })
  }

  const groups = await prisma.wordGroup.findMany({
    where: { id: { in: groupIds } },
    orderBy: { sortOrder: 'asc' },
    include: {
      words: {
        orderBy: { sortOrder: 'asc' },
        include: {
          word: {
            include: {
              meanings: {
                select: {
                  partOfSpeech: true,
                  definitionCn: true,
                  example: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const result = groups.map((g) => ({
    id: g.id,
    name: g.name,
    words: g.words.map((wi) => ({
      word: wi.word.text,
      meanings: wi.word.meanings.map((m) => ({
        pos: m.partOfSpeech,
        definitionCn: m.definitionCn,
        example: m.example,
      })),
    })),
  }))

  return NextResponse.json({ groups: result })
}
