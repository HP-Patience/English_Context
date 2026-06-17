import { NextRequest, NextResponse } from 'next/server'
import { prisma, getLocalUserId } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const config = user?.ttsConfig ? JSON.parse(user.ttsConfig) : {}

    const { text, voice: voiceParam } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text required' }, { status: 400 })
    }

    const provider = config.provider || 'browser'
    if (provider === 'browser') {
      return NextResponse.json({ error: 'Browser TTS does not use API' }, { status: 400 })
    }

    const baseURL = (config.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const apiKey = config.apiKey
    const voice = voiceParam || config.voice || 'alloy'

    if (!apiKey) {
      return NextResponse.json({ error: 'TTS API key not configured' }, { status: 400 })
    }

    const response = await fetch(`${baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('TTS API error:', response.status, errText)
      return NextResponse.json({ error: 'TTS API request failed' }, { status: response.status })
    }

    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('TTS proxy error:', err)
    return NextResponse.json({ error: 'TTS 请求失败' }, { status: 500 })
  }
}
