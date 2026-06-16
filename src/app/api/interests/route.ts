import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const userId = await getLocalUserId()

  const { interests } = await req.json()
  await prisma.user.update({
    where: { id: userId },
    data: { interests: JSON.stringify(interests ?? []) },
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const userId = await getLocalUserId()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { interests: true },
  })

  return NextResponse.json({
    interests: user?.interests ? JSON.parse(user.interests) : [],
  })
}
