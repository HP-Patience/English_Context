'use client'

import { useState } from 'react'

import { clearCache } from '@/lib/api-cache'
import { purgeStoryOfflineCache, withStoryOfflineLock } from '@/lib/story-offline-cache'

export default function LogoutButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    if (busy) return
    setBusy(true)
    setError('')
    clearCache()

    let purgeComplete = false
    try {
      const response = await withStoryOfflineLock(async () => {
        await purgeStoryOfflineCache()
        purgeComplete = true
        return fetch('/api/auth/logout', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
        })
      })
      if (!response.ok) {
        setError('退出请求失败，请重试。')
        setBusy(false)
        return
      }
      window.location.assign('/login')
    } catch (caught) {
      if (!purgeComplete && (caught instanceof Error || caught instanceof DOMException)) {
        setError('离线课程数据未能清除，当前登录状态已保留。请重试。')
        setBusy(false)
        return
      }
      if (!(caught instanceof TypeError)) throw caught
      setError('退出请求失败，请检查网络后重试。')
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className={className}
      >
        {busy ? '退出中…' : '退出'}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  )
}
