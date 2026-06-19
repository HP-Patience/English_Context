'use client'

import { useTts } from '@/hooks/useTts'

const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1')

export default function SentenceTTSButton({ text }: { text: string }) {
  const { play, playing, supported } = useTts(clean(text))

  if (!supported) return null

  return (
    <button
      onClick={play}
      disabled={playing}
      type="button"
      className={`inline-flex items-center justify-center rounded-md p-1.5 transition shrink-0 ${
        playing
          ? 'text-amber-500 animate-pulse'
          : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800'
      }`}
      title="朗读句子"
      aria-label="朗读句子"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 010 7.07" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19.07 4.93a10 10 0 010 14.14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
