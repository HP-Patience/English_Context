'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type TtsConfig = {
  provider: string
  baseURL: string
  voice: string
  hasKey: boolean
}

export function useTts(text: string) {
  const [playing, setPlaying] = useState(false)
  const [config, setConfig] = useState<TtsConfig | null>(null)
  const [supported, setSupported] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.speechSynthesis) {
      setSupported(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const play = useCallback(async () => {
    if (playing) return
    setPlaying(true)

    try {
      let cfg = config
      if (!cfg) {
        const res = await fetch('/api/settings/tts')
        const data: TtsConfig | null = res.ok ? await res.json() : null
        if (data) {
          setConfig(data)
          cfg = data
        }
      }

      const activeCfg = cfg ?? { provider: 'browser', baseURL: '', voice: '', hasKey: false }

      if (activeCfg.provider !== 'browser' && activeCfg.hasKey) {
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: activeCfg.voice || undefined }),
          })
          if (res.ok) {
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => {
              URL.revokeObjectURL(url)
              setPlaying(false)
            }
            await audio.play()
            return
          }
        } catch {
          /* fallback to browser */
        }
      }

      if (window.speechSynthesis) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel()
        }

        let voices = window.speechSynthesis.getVoices()
        if (!voices.length) {
          await new Promise<void>((r) => {
            window.speechSynthesis.onvoiceschanged = () => {
              window.speechSynthesis.onvoiceschanged = null
              r()
            }
            setTimeout(r, 300)
          })
          voices = window.speechSynthesis.getVoices()
        }
        const enVoice = voices.find((v) => v.lang.startsWith('en'))

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'en-US'
        utterance.rate = 0.9
        if (enVoice) utterance.voice = enVoice

        const safetyTimer = setTimeout(() => setPlaying(false), 5000)
        utterance.onend = () => {
          clearTimeout(safetyTimer)
          setPlaying(false)
        }
        utterance.onerror = () => {
          clearTimeout(safetyTimer)
          setPlaying(false)
        }

        window.speechSynthesis.speak(utterance)
      } else {
        setPlaying(false)
      }
    } catch {
      setPlaying(false)
    }
  }, [text, playing, config])

  return { play, playing, supported }
}
