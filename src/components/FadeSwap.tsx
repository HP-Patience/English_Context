'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Mount incoming content hidden while loading; cross-fade only once it is ready. */
export function FadeSwap({ transitionKey, children, className = '' }: {
  transitionKey: string | number
  children: ReactNode
  className?: string
}) {
  const [displayed, setDisplayed] = useState({ key: transitionKey, children })
  const [readyKey, setReadyKey] = useState<string | number | null>(null)
  const incoming = useRef<HTMLDivElement>(null)
  const changing = displayed.key !== transitionKey
  const ready = changing && readyKey === transitionKey
  if (!changing && displayed.children !== children) setDisplayed({ key: transitionKey, children })
  if (!changing && readyKey !== null) setReadyKey(null)

  useEffect(() => {
    if (!changing || !incoming.current) return
    const panel = incoming.current
    let timer: number | undefined
    function check() {
      if (panel.querySelector('[data-page-loading]')) return
      observer.disconnect()
      timer = window.setTimeout(() => setReadyKey(transitionKey), 0)
    }
    const observer = new MutationObserver(check)
    observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-loading'] })
    check()
    return () => {
      observer.disconnect()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [changing, transitionKey])

  useEffect(() => {
    if (!ready) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setDisplayed({ key: transitionKey, children }), reduced ? 0 : 120)
    return () => window.clearTimeout(timer)
  }, [ready, transitionKey, children])

  return (
    <div className={`${className} content-fade-stack`} aria-busy={changing}>
      <div key={displayed.key} className={`content-fade ${ready ? 'content-fade-exit' : ''}`}
        inert={changing || undefined} aria-hidden={changing || undefined}>
        {changing ? displayed.children : children}
      </div>
      {changing ? <div key={transitionKey} ref={incoming}
        className={`content-fade ${ready ? 'content-fade-enter' : 'content-fade-wait'}`}
        inert={!ready || undefined} aria-hidden={!ready || undefined}>
        {children}
      </div> : null}
    </div>
  )
}
