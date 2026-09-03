'use client'

import Link from 'next/link'
import { useState } from 'react'

type StoryTargetLinkProps = {
  readonly word: string
  readonly gloss: string
  readonly wordId?: string
  readonly initiallyVisible: boolean
}

export function StoryTargetLink({ word, gloss, wordId, initiallyVisible }: StoryTargetLinkProps) {
  const [visible, setVisible] = useState(initiallyVisible)

  return (
    <span className="story-target mx-1 my-0.5 inline-flex max-w-full flex-nowrap items-center gap-0 align-middle rounded px-0.5 font-semibold leading-none">
      {wordId ? (
        <Link
          href={`/word/${encodeURIComponent(wordId)}`}
          lang="en"
          className="min-w-0 px-1 leading-8 underline decoration-[var(--story-accent-line)] underline-offset-2 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
        >
          {word}
        </Link>
      ) : <span lang="en">{word}</span>}
      <button
        type="button"
        aria-expanded={visible}
        aria-pressed={visible}
        aria-label={`${visible ? '隐藏' : '显示'}段内 ${word} 的释义`}
        onClick={() => setVisible((current) => !current)}
        className="story-target-gloss inline-grid h-6 min-w-14 max-w-full grid-cols-1 grid-rows-1 place-items-center rounded-sm border border-dashed border-[var(--story-accent-line)] bg-[var(--story-surface)] px-1.5 text-[0.625rem] font-medium leading-none [overflow-wrap:anywhere] hover:border-[var(--story-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--story-accent)]"
      >
        <span
          aria-hidden={!visible}
          lang="zh-CN"
          className={`col-start-1 row-start-1 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          {gloss}
        </span>
        <span
          aria-hidden={visible}
          className={`col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-0' : 'opacity-100'}`}
        >
          显示释义
        </span>
      </button>
    </span>
  )
}
