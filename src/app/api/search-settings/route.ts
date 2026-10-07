import { NextRequest, NextResponse } from 'next/server'

import { getLocalUserId, prisma } from '@/lib/prisma'

export async function GET() {
  const userId = await getLocalUserId()
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { searchCaseInsensitive: true } })
  return NextResponse.json({ searchCaseInsensitive: user?.searchCaseInsensitive ?? true })
}

export async function POST(request: NextRequest) {
  const userId = await getLocalUserId()
  const body = await request.json() as { searchCaseInsensitive?: unknown }
  if (typeof body.searchCaseInsensitive !== 'boolean') {
    return NextResponse.json({ error: 'Invalid search setting' }, { status: 400 })
  }
  await prisma.user.update({ where: { id: userId }, data: { searchCaseInsensitive: body.searchCaseInsensitive } })
  return NextResponse.json({ searchCaseInsensitive: body.searchCaseInsensitive })
}
