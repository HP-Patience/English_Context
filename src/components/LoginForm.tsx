'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

async function clearBrowserCaches() {
  if (!('caches' in window)) return
  const names = await window.caches.keys()
  await Promise.all(names.map((name) => window.caches.delete(name)))
}

export default function LoginForm() {
  const searchParams = useSearchParams()
  const configurationError = searchParams.get('error') === 'configuration'
  const returnTo = safeReturnPath(searchParams.get('next'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(configurationError ? '服务器尚未配置登录信息' : '')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setError(payload?.error ?? '登录失败，请稍后重试')
        return
      }

      await clearBrowserCaches()
      window.location.assign(returnTo)
    } catch {
      setError('无法连接服务器，请检查网络后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="username" className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
          用户名
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500 dark:focus:ring-amber-950"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500 dark:focus:ring-amber-950"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-stone-900 px-4 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
      >
        {submitting ? '验证中…' : '登录'}
      </button>
    </form>
  )
}
