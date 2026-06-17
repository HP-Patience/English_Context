import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const config = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}
    return NextResponse.json({
      provider: config.provider || 'browser',
      baseURL: config.baseURL || '',
      voice: config.voice || '',
      hasKey: !!config.apiKey,
    })
  } catch {
    return NextResponse.json({ provider: 'browser', baseURL: '', voice: '', hasKey: false })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { provider, baseURL, apiKey, voice } = await req.json()
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const existing = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}

    if (provider !== undefined) existing.provider = provider
    if (baseURL !== undefined) existing.baseURL = baseURL
    if (apiKey !== undefined) existing.apiKey = apiKey
    if (voice !== undefined) existing.voice = voice

    for (const k of ['provider', 'baseURL', 'apiKey', 'voice']) {
      if (!existing[k]) delete existing[k]
    }

    await prisma.user.update({
      where: { id: userId },
      data: { ttsConfig: JSON.stringify(existing) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
