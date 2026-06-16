import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

async function getLlmConfig() {
  const userId = await getLocalUserId()
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.llmConfig) return JSON.parse(user.llmConfig)
  return {}
}

export async function GET() {
  const cfg = await getLlmConfig()
  const baseURL = cfg.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const apiKey = cfg.apiKey || process.env.OPENAI_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: '未配置 API Key' }, { status: 400 })
  }

  try {
    const res = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `API 错误 (${res.status}): ${text}` }, { status: 502 })
    }
    const data = await res.json()
    const models: string[] = (data.data || [])
      .map((m: any) => m.id)
      .filter((id: string) => !id.startsWith('ft:'))
    return NextResponse.json({ models })
  } catch (e: any) {
    return NextResponse.json({ error: `请求失败: ${e.message}` }, { status: 502 })
  }
}
