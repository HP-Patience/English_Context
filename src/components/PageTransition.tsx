'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/** CSS-only motion works on HTTP; no secure-context browser API is required. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const root = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const snapshot = useRef<HTMLElement | null>(null)
  const lastPath = useRef(pathname)

  useEffect(() => {
    function capture() {
      if (!content.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const clone = content.current.cloneNode(true) as HTMLElement
      clone.className = 'route-fade-snapshot'
      clone.setAttribute('aria-hidden', 'true')
      clone.inert = true
      clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'))
      snapshot.current = clone
    }
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.download || (link.target && link.target !== '_self')) return
      const destination = new URL(link.href, location.href)
      if (destination.origin === location.origin && destination.pathname !== location.pathname) capture()
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
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      snapshot.current = null
      return
    }
    const clone = snapshot.current
    snapshot.current = null
    const panel = content.current
    const container = root.current
    if (clone) container.appendChild(clone)
    panel.classList.remove('route-fade-enter', 'route-fade-delayed')
    // Restart only for navigation, not for data updates or button clicks.
    void panel.offsetWidth
    panel.classList.add('route-fade-enter')
    if (clone) panel.classList.add('route-fade-delayed')
    const timer = window.setTimeout(() => {
      clone?.remove()
      panel.classList.remove('route-fade-enter', 'route-fade-delayed')
    }, 200)
    return () => {
      window.clearTimeout(timer)
      clone?.remove()
      panel.classList.remove('route-fade-enter', 'route-fade-delayed')
    }
  }, [pathname])

  return <div ref={root} className="relative"><div ref={content}>{children}</div></div>
}
