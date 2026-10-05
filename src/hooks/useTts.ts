'use client'

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react'
import { loadBrowserVoices, selectBrowserVoice, TTS_SETTINGS_CHANGED } from '@/lib/browser-tts'

type TtsConfig = {
  provider: string
  baseURL: string
  voice: string
  browserVoice?: string
  hasKey: boolean
}

const subscribeToSupport = () => () => {}
const getSpeechSupport = () => !!window.speechSynthesis
const getServerSupport = () => true

export function useTts(text: string) {
  const [playing, setPlaying] = useState(false)
  const [config, setConfig] = useState<TtsConfig | null>(null)
  const supported = useSyncExternalStore(subscribeToSupport, getSpeechSupport, getServerSupport)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  useEffect(() => {
    const resetConfig = () => setConfig(null)
    window.addEventListener(TTS_SETTINGS_CHANGED, resetConfig)
    return () => window.removeEventListener(TTS_SETTINGS_CHANGED, resetConfig)
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

        const voices = await loadBrowserVoices(window.speechSynthesis)
        const enVoice = selectBrowserVoice(voices, cfg?.browserVoice || '')

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = enVoice?.lang || 'en-US'
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
