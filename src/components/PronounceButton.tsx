'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type TtsConfig = {
  provider: string
  baseURL: string
  voice: string
  hasKey: boolean
}

export default function PronounceButton({ word }: { word: string }) {
  const [playing, setPlaying] = useState(false)
  const [config, setConfig] = useState<TtsConfig | null>(null)
  const [supported, setSupported] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 检查浏览器是否支持 speechSynthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.speechSynthesis) {
      setSupported(false)
    }
  }, [])

  // 页面切换时停止播放
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
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
      // 懒加载 TTS 配置 (仅首次点击)
      if (!config) {
        const res = await fetch('/api/settings/tts')
        if (res.ok) {
          const data = await res.json()
          setConfig(data)
        }
      }

      const cfg = config || { provider: 'browser', baseURL: '', voice: '', hasKey: false }

      if (cfg.provider !== 'browser' && cfg.hasKey) {
        // 外部 API TTS
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: word, voice: cfg.voice || undefined }),
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
          // API 失败, 降级到浏览器
        }
      }

      // 浏览器 speechSynthesis (兜底)
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel() // 取消上一次
        const utterance = new SpeechSynthesisUtterance(word)
        utterance.lang = 'en-US'
        utterance.rate = 0.9
        utterance.onend = () => setPlaying(false)
        utterance.onerror = () => setPlaying(false)
        window.speechSynthesis.speak(utterance)
      } else {
        setPlaying(false)
      }
    } catch {
      setPlaying(false)
    }
  }, [word, playing, config])

  if (!supported) return null

  return (
    <button
      onClick={play}
      disabled={playing}
      type="button"
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition ${
        playing
          ? 'text-amber-500 animate-pulse'
          : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800'
      }`}
      title="发音"
      aria-label={`播放 ${word} 发音`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 010 7.07" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19.07 4.93a10 10 0 010 14.14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
