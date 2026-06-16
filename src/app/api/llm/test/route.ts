import { NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'
import OpenAI from 'openai'

async function getLlmConfig() {
  const userId = await getLocalUserId()
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.llmConfig) return JSON.parse(user.llmConfig)
  return {}
}

export async function POST() {
  const cfg = await getLlmConfig()
  const apiKey = cfg.apiKey || process.env.OPENAI_API_KEY
  const baseURL = cfg.baseURL || process.env.OPENAI_BASE_URL || undefined
  const model = cfg.model || process.env.LLM_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    return NextResponse.json({ error: '未配置 API Key' }, { status: 400 })
  }

  try {
    const openai = new OpenAI({ apiKey, baseURL })
    const res = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: '回复"主人我在"（仅回复这四个字，不要其他内容）' }],
      thinking: { type: 'disabled' },
      reasoning_effort: 'high',
      max_tokens: 20,
      temperature: 0,
    } as any)
    const reply = res.choices[0]?.message?.content?.trim() || ''
    return NextResponse.json({ ok: true, reply })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '连接失败' }, { status: 502 })
  }
}
