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
      browserVoice: config.browserVoice || '',
      hasKey: !!config.apiKey,
    })
  } catch {
    return NextResponse.json({ provider: 'browser', baseURL: '', voice: '', browserVoice: '', hasKey: false })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { provider, baseURL, apiKey, voice, browserVoice } = await req.json()
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const existing = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}

    if (provider !== undefined) existing.provider = provider
    if (baseURL !== undefined) existing.baseURL = baseURL
    if (apiKey !== undefined) existing.apiKey = apiKey
    if (voice !== undefined) existing.voice = voice
    if (browserVoice !== undefined) {
      if (typeof browserVoice !== 'string' || browserVoice.length > 1000) {
        return NextResponse.json({ error: '无效的浏览器音色' }, { status: 400 })
      }
      existing.browserVoice = browserVoice
    }

    for (const k of ['provider', 'baseURL', 'apiKey', 'voice', 'browserVoice']) {
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
