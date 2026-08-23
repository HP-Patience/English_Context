'use client'

import { useState } from 'react'

async function clearBrowserCaches() {
  if (!('caches' in window)) return
  const names = await window.caches.keys()
  await Promise.all(names.map((name) => window.caches.delete(name)))
}

export default function LogoutButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false)

  async function logout() {
    if (busy) return
    setBusy(true)

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        cache: 'no-store',
      })
      await clearBrowserCaches()
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className={className}
    >
      {busy ? '退出中…' : '退出'}
    </button>
  )
}
