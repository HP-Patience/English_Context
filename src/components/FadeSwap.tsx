'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** Keep previous content until the next content is ready, then fade in place. */
export function FadeSwap({ transitionKey, children, className = '' }: {
  transitionKey: string | number
  children: ReactNode
  className?: string
}) {
  const [displayed, setDisplayed] = useState({ key: transitionKey, children })
  const changing = displayed.key !== transitionKey
  if (!changing && displayed.children !== children) {
    setDisplayed({ key: transitionKey, children })
  }

  useEffect(() => {
    if (!changing) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setDisplayed({ key: transitionKey, children }), reduced ? 0 : 80)
    return () => window.clearTimeout(timer)
  }, [changing, transitionKey, children])

  return (
    <div className={className} aria-busy={changing}>
      <div key={displayed.key} className={`content-fade ${changing ? 'content-fade-exit' : 'content-fade-enter'}`}
        onAnimationEnd={event => {
          if (event.target === event.currentTarget && !changing) event.currentTarget.classList.remove('content-fade-enter')
        }}
        inert={changing || undefined} aria-busy={changing || undefined}>
        {changing ? displayed.children : children}
      </div>
    </div>
  )
}
