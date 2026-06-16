import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function GET() {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const config = user?.llmConfig ? JSON.parse(user.llmConfig) : {}
    return NextResponse.json({
      baseURL: config.baseURL || '',
      model: config.model || '',
      hasKey: !!config.apiKey,
    })
  } catch {
    return NextResponse.json({ baseURL: '', model: '', hasKey: false })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { baseURL, apiKey, model } = await req.json()
    const userId = await getLocalUserId()

    // merge with existing config so partial updates don't drop fields
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const existing = user?.llmConfig ? JSON.parse(user.llmConfig) : {}

    if (baseURL !== undefined) existing.baseURL = baseURL
    if (apiKey !== undefined) existing.apiKey = apiKey
    if (model !== undefined) existing.model = model

    // remove empty strings so GET response is clean
    for (const k of ['baseURL', 'apiKey', 'model']) {
      if (!existing[k]) delete existing[k]
    }

    await prisma.user.update({
      where: { id: userId },
      data: { llmConfig: JSON.stringify(existing) },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
