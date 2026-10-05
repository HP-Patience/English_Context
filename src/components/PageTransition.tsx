'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/** Keep the outgoing page visible until the incoming page finishes its initial load. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const root = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const snapshot = useRef<HTMLElement | null>(null)
  const lastPath = useRef(pathname)
  const holding = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function capture() {
      if (!content.current) return
      const source = content.current.querySelector('[data-page-loading]') ? holding.current : content.current
      if (!source) return
      const clone = source.cloneNode(true) as HTMLElement
      clone.className = 'route-fade-snapshot route-fade-hold'
      clone.setAttribute('aria-hidden', 'true')
      clone.inert = true
      clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'))
      snapshot.current = clone
    }
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[href]')
      if (link instanceof HTMLAnchorElement) {
        if (link.download || (link.target && link.target !== '_self')) return
        const destination = new URL(link.href, location.href)
        if (destination.origin === location.origin && destination.pathname !== location.pathname) capture()
      } else if (event.target.closest('button')) {
        // Also covers existing router.push/back buttons without intercepting their action.
        capture()
      }
    }
    document.addEventListener('click', click, true)
    window.addEventListener('popstate', capture)
    return () => {
      document.removeEventListener('click', click, true)
      window.removeEventListener('popstate', capture)
      snapshot.current = null
    }
  }, [])

  useLayoutEffect(() => {
    if (lastPath.current === pathname || !root.current || !content.current) return
    lastPath.current = pathname
    const panel = content.current
    const container = root.current
    const clone = snapshot.current
    snapshot.current = null
    let timer: number | undefined
    let started = false
    const previousMinHeight = container.style.minHeight
    if (clone) {
      container.style.minHeight = `${panel.getBoundingClientRect().height}px`
      container.appendChild(clone)
      holding.current = clone
      container.style.minHeight = `${clone.getBoundingClientRect().height}px`
      panel.style.visibility = 'hidden'
      panel.inert = true
    }
    function cleanup() {
      clone?.remove()
      if (holding.current === clone) holding.current = null
      panel.style.visibility = ''
      panel.inert = false
      panel.classList.remove('route-fade-enter')
      container.style.minHeight = previousMinHeight
    }
    function reveal() {
      if (started || panel.querySelector('[data-page-loading]')) return
      started = true
      observer.disconnect()
      panel.style.visibility = ''
      panel.inert = false
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        cleanup()
        return
      }
      // Both layers animate together: there is never an all-transparent frame.
      panel.classList.add('route-fade-enter')
      clone?.classList.remove('route-fade-hold')
      timer = window.setTimeout(cleanup, 120)
    }
    const observer = new MutationObserver(reveal)
    observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-page-loading'] })
    reveal()
    return () => {
      observer.disconnect()
      if (timer !== undefined) window.clearTimeout(timer)
      cleanup()
    }
  }, [pathname])

  return <div ref={root} className="relative"><div ref={content}>{children}</div></div>
}
